// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort.js';
import { initializeDatabaseSchema } from '../../../../../lib/core/database/migrations.js';
import { syncIdentityPartition } from '../../../../../lib/core/sync/syncIdentityDigest.js';
import { verifySyncIdentityFactProof } from '../../../../../lib/core/sync/syncIdentityFactProofSeal.js';
import { readReadySyncIdentitySummary } from '../../../../../lib/core/sync/syncIdentityIndexMaintenance.js';
import { buildSyncIdentityNodeFactIndex,
  readSyncIdentityNodeFactSummary } from '../../../../../lib/core/sync/syncIdentityNodeFactIndex.js';
import { buildSyncIdentityPackPage } from '../../../../../lib/core/sync/syncIdentityPackPage.js';

const runtime = vi.hoisted(() => ({ port: null as unknown }));
vi.mock('../../companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: (task: () => Promise<unknown>) => task()
}));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    runWriter: (task: (port: unknown) => Promise<unknown>) => task(runtime.port)
  })
}));

import { prepareCompanionSyncIdentityPack } from './syncGroupIdentityPackPrepare.js';
import { readCompanionSyncIdentitySource } from './syncGroupIdentitySourceRead.js';
import { createCompanionSyncGroupSourceSnapshot } from './syncGroupSourceSnapshot.js';

async function expectIdentitySnapshotReads(sqlite: Database.Database, target: string,
  summary: Awaited<ReturnType<typeof readReadySyncIdentitySummary>>) {
  const reader = createBetterSqliteDbPort(sqlite);
  const request = { snapshot_path: target };
  const published = await readCompanionSyncIdentitySource(reader,
    { ...request, read_kind: 'summary' });
  expect(published).toMatchObject({ partitions: summary });
  const slot = syncIdentityPartition('node', 'deleted');
  const page = await readCompanionSyncIdentitySource(reader,
    { ...request, read_kind: 'page', partition: slot });
  expect(page).toMatchObject({ entries: [expect.objectContaining({ object_id: 'deleted' })] });
  const identity = (page as { entries: Array<{ object_type: string;
    object_id: string; fingerprint: string }> }).entries[0]!;
  const sourceViewId = '12345678-1234-1234-1234-123456789abc';
  const packPage = buildSyncIdentityPackPage({ group_id: 'group',
    source_peer_id: 'source', target_peer_id: 'target', source_view_id: sourceViewId,
    page_index: 0, previous_page_id: null, objects: [identity] });
  await expect(prepareCompanionSyncIdentityPack(reader, {
    snapshot_path: target, page: packPage, source_view_id: sourceViewId,
    authenticated_device_id: 'target'
  })).resolves.toEqual({ page_id: packPage.page_id });
  const stale = buildSyncIdentityPackPage({ ...packPage,
    objects: [{ ...identity, fingerprint: 'a'.repeat(64) }] });
  await expect(prepareCompanionSyncIdentityPack(reader, {
    snapshot_path: target, page: stale, source_view_id: sourceViewId,
    authenticated_device_id: 'target'
  })).rejects.toThrow('sync_identity_pack_source_changed');
  const factPage = await readCompanionSyncIdentitySource(reader,
    { ...request, read_kind: 'fact_global_page' });
  expect(factPage).toMatchObject({ entries: [expect.objectContaining({ object_id: 'deleted' })] });
  const versionFacts = await readCompanionSyncIdentitySource(reader, {
    ...request, read_kind: 'node_facts', node_id: 'deleted', section: 'versions'
  });
  expect(versionFacts).toMatchObject({ node_id: 'deleted', section: 'versions',
    entries: [expect.objectContaining({ version_id: 'deleted-v1' })] });
  const changed = await readCompanionSyncIdentitySource(reader,
    { ...request, read_kind: 'changed_page', since: '' });
  expect(changed).toMatchObject({ entries: expect.arrayContaining([
    expect.objectContaining({ object_type: 'node', object_id: 'deleted' }),
    expect.objectContaining({ object_type: 'node_position' })
  ]) });
  await expect(readCompanionSyncIdentitySource(reader,
    { ...request, read_kind: 'page', partition: 256 })).rejects.toThrow('sync_identity_request_invalid');
  await expect(readCompanionSyncIdentitySource(reader,
    { ...request, read_kind: 'fact_global_summary' })).resolves.toMatchObject({
    inventory: expect.objectContaining({ row_count: 1 })
  });
}

it('captures old orphan tombstones after assigning durable source positions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-snapshot-test-'));
  const target = path.join(root, 'cache', 'foliole-provider-source-test.db').replaceAll(path.sep, '/');
  await fs.mkdir(path.dirname(target));
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    sqlite.exec(`INSERT INTO sync_groups
      (group_id, display_name, workgroup_key, created_at, updated_at)
      VALUES ('group', 'Group', 'key', 'now', 'now');
      INSERT INTO sync_group_local_state VALUES (1, 'group', 'source', 'active', 'now');
      INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path,
       device_name, platform, state, joined_at, updated_at)
      VALUES ('group', 'target', 'anchor', '/target', 'Target', 'ios', 'active', 'now', 'now');
      INSERT INTO sync_object_state
      (object_type, object_id, state_seq, current_version_id, content_hash,
       last_modified_by_host_name, updated_at, deleted_at)
      VALUES ('node', 'old', 9, NULL, 'hash', 'Mac', 'now', NULL);
      INSERT INTO node_sync_tombstones
      (node_id, version_id, parent_version_id, host_name, content_hash,
       snapshot_json, deleted_at, created_at)
      VALUES ('deleted', 'deleted-v1', NULL, 'Mac', 'hash', '{}', 'then', 'then');
      INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at,
       content_hash, body_text, snapshot_json)
      VALUES ('deleted-v1', 'deleted', NULL, 'Mac', 'then', 'hash', '', '{}');`);
    runtime.port = createBetterSqliteDbPort(sqlite);
    await expect(createCompanionSyncGroupSourceSnapshot({ target_path: target, identity_index: true }))
      .resolves.toEqual({ snapshot_path: target });
    const snapshot = new Database(target, { readonly: true });
    try {
      expect(snapshot.prepare(`SELECT state_seq FROM sync_object_state
        WHERE object_type = 'node' AND object_id = 'deleted'`).pluck().get()).toBe(10);
      expect(snapshot.prepare('SELECT high_water FROM sync_state_sequence').pluck().get()).toBe(11);
      const summary = await readReadySyncIdentitySummary(createBetterSqliteDbPort(snapshot));
      expect(summary).toHaveLength(256);
      expect(summary.reduce((sum, row) => sum + row.row_count, 0)).toBe(2);
      const facts = await readSyncIdentityNodeFactSummary(createBetterSqliteDbPort(snapshot));
      expect(facts).toHaveLength(1);
      expect(facts.reduce((sum, row) => sum + row.row_count, 0)).toBe(1);
      await expect(verifySyncIdentityFactProof(createBetterSqliteDbPort(snapshot)))
        .resolves.toMatch(/^[a-f0-9]{64}$/u);
      await buildSyncIdentityNodeFactIndex(createBetterSqliteDbPort(sqlite));
      expect(facts).toEqual(await readSyncIdentityNodeFactSummary(createBetterSqliteDbPort(sqlite)));
      await expectIdentitySnapshotReads(sqlite, target, summary);
    } finally { snapshot.close(); }
    const changed = new Database(target);
    try {
      changed.prepare(`UPDATE sync_identity_source_proof SET proof_root = ?
        WHERE singleton_id = 1`).run('0'.repeat(64));
    } finally { changed.close(); }
    await expect(readCompanionSyncIdentitySource(createBetterSqliteDbPort(sqlite),
      { snapshot_path: target, read_kind: 'fact_summary' }))
      .rejects.toThrow('sync_identity_source_view_changed');
  } finally {
    sqlite.close();
    await fs.rm(root, { force: true, recursive: true });
  }
});
