// @vitest-environment node
import { expect, it } from 'vitest';

import { port, proveBase, setupVersionCollectionFixture, sqlite } from '../../../electron/database/nodeVersionPayloadCollector.testSupport.js';
import { observeReads } from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import { migrateBodyContentStorage } from '../database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../database/bodyContentOwnerMigration.js';

import { adoptVerifiedBody, stageTextBodyContent } from './bodyContentWrite.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { loadVerifiedBodyRef } from './verifiedBody.js';

setupVersionCollectionFixture();

it('retires the same historical versions without changing identities or original edges', async () => {
  const body = '\ufeff中😀\0文'.repeat(300000);
  sqlite.prepare('UPDATE node_sync_versions SET body_text = ?, snapshot_json = ? WHERE version_id = ?')
    .run(body, JSON.stringify({ id: 'node', content: body, text_alternatives: [] }), 'B');
  proveBase('A');
  await port.transaction(async (tx) => {
    await migrateBodyContentStorage(tx);
    await migrateBodyContentOwners(tx, 'desktop');
  });
  const before = sqlite.prepare('SELECT version_id, parent_version_id, content_hash FROM node_sync_versions ORDER BY version_id').all();
  const edges = sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all();
  const hash = sqlite.prepare("SELECT body_blob_hash FROM node_sync_versions WHERE version_id = 'B'").pluck().get() as string;
  const reads = observeReads(port);
  expect(await collectNodeVersionPayloads(reads.port, 'node', 32, false, 'chunked'))
    .toEqual({ released: 3, skipped: null });
  expect(sqlite.prepare('SELECT version_id, parent_version_id, content_hash FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
  expect(sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all()).toEqual(edges);
  expect(sqlite.prepare("SELECT version_id FROM node_sync_versions WHERE body_state = 'retired' ORDER BY version_id").pluck().all())
    .toEqual(['B', 'C', 'D']);
  expect(await loadVerifiedBodyRef(port, hash)).toBeNull();
  expect(Math.max(...reads.sizes)).toBeLessThanOrEqual(512 * 1024);
  expect(sqlite.prepare("SELECT count(*) FROM node_sync_versions WHERE version_id IN ('A','E') AND body_state = 'readable'").pluck().get()).toBe(2);
});

it('preserves a released historical body when another permanent holder still owns it', async () => {
  proveBase('A');
  await port.transaction(async (tx) => {
    await migrateBodyContentStorage(tx);
    await migrateBodyContentOwners(tx, 'desktop');
  });
  const ref = await stageTextBodyContent(port, 'body-B');
  await adoptVerifiedBody(port, ref, '');
  sqlite.prepare('UPDATE nodes SET body_blob_hash = ? WHERE id = ?').run(ref.hash, 'node');
  expect((await collectNodeVersionPayloads(port, 'node', 32, false, 'chunked')).released).toBe(3);
  expect(await loadVerifiedBodyRef(port, ref.hash)).toEqual(ref);
  expect(sqlite.prepare("SELECT body_state, body_blob_hash FROM node_sync_versions WHERE version_id = 'B'").get())
    .toEqual({ body_state: 'retired', body_blob_hash: null });
});
