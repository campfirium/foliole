// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { collectNodeVersionChainWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { loadVerifiedBodyRef } from '../../lib/core/sync/verifiedBody.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { observeDriver } from './bodyContentDriver.testSupport.js';
import { port, proveBase, setupVersionCollectionFixture, sqlite } from './nodeVersionPayloadCollector.testSupport.js';
import { observeReads } from './syncNodeVerifiedTopicConflict.testSupport.js';

setupVersionCollectionFixture();

async function migrate() {
  await port.transaction(async (tx) => {
    await migrateBodyContentStorage(tx);
    await migrateBodyContentOwners(tx, 'desktop');
  });
}

it.each(['legacy_driver', 'chunked_port', 'chunked_driver'] as const)(
  'preserves identities and edges while retiring the same versions through %s', async (mode) => {
    const body = '\ufeff中😀\0文'.repeat(300000);
    const alternativeHash = upsertTextBodyBlob(createBetterSqlite3Driver(sqlite), 'Alternative original', '');
    sqlite.prepare('UPDATE node_sync_versions SET body_text = ?, snapshot_json = ? WHERE version_id = ?')
      .run(body, JSON.stringify({ id: 'node', content: body, text_alternatives: [{ body_blob_hash: alternativeHash }] }), 'B');
    proveBase('A');
    if (mode !== 'legacy_driver') await migrate();
    const identities = sqlite.prepare('SELECT version_id, parent_version_id, content_hash FROM node_sync_versions ORDER BY version_id').all();
    const edges = sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all();
    const hash = mode === 'legacy_driver' ? null : sqlite.prepare("SELECT body_blob_hash FROM node_sync_versions WHERE version_id = 'B'").pluck().get() as string;
    const reads = observeDriver(createBetterSqlite3Driver(sqlite));
    if (mode === 'chunked_port') {
      const asyncReads = observeReads(port);
      expect(await collectNodeVersionPayloads(asyncReads.port, 'node', 32, false, 'chunked'))
        .toEqual({ released: 3, skipped: null });
      reads.sizes.push(...asyncReads.sizes);
    } else collectNodeVersionChainWithDriver(reads.driver, 'node', mode === 'legacy_driver' ? 'continuous' : 'chunked');
    expect(sqlite.prepare('SELECT version_id, parent_version_id, content_hash FROM node_sync_versions ORDER BY version_id').all()).toEqual(identities);
    expect(sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all()).toEqual(edges);
    const retired = mode === 'legacy_driver' ? 'body_text IS NULL' : "body_state = 'retired'";
    expect(sqlite.prepare(`SELECT version_id FROM node_sync_versions WHERE ${retired} ORDER BY version_id`).pluck().all())
      .toEqual(['B', 'C', 'D']);
    expect(reads.sizes.length).toBeGreaterThan(5);
    expect(Math.max(...reads.sizes)).toBeLessThanOrEqual(512 * 1024);
    if (hash) {
      expect(await loadVerifiedBodyRef(port, hash)).toBeNull();
      expect(await loadVerifiedBodyRef(port, alternativeHash)).toBeNull();
    }
    expect(sqlite.prepare('SELECT hash FROM content_blobs WHERE hash = ?').get(alternativeHash)).toBeUndefined();
  });

it('rolls back chain retirement and body deletion together when deletion rejects', async () => {
  proveBase('A');
  await migrate();
  const before = sqlite.prepare('SELECT version_id, body_state, body_blob_hash, snapshot_json FROM node_sync_versions ORDER BY version_id').all();
  const hash = sqlite.prepare("SELECT body_blob_hash FROM node_sync_versions WHERE version_id = 'C'").pluck().get() as string;
  sqlite.exec(`CREATE TRIGGER reject_body BEFORE DELETE ON content_bodies
    WHEN OLD.hash = '${hash}' BEGIN SELECT RAISE(ABORT, 'body_delete_rejected'); END`);
  expect(() => collectNodeVersionChainWithDriver(createBetterSqlite3Driver(sqlite), 'node', 'chunked'))
    .toThrow('body_delete_rejected');
  expect(sqlite.prepare('SELECT version_id, body_state, body_blob_hash, snapshot_json FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
  expect(await loadVerifiedBodyRef(port, hash)).not.toBeNull();
});
