// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { projectFramedSyncNodeIdentityFact, projectFramedSyncNodeRecord, restoreFramedSyncProjectedNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { restoreFramedSyncNodeIdentityFact } from '../../lib/core/sync/framedSyncNodeRestore.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadRetainedSyncNodeVersionRecords } from '../../lib/core/sync/syncNodeGraph.js';
import { hasCompleteTombstoneVersion } from '../../lib/core/sync/syncNodeTombstoneVersion.js';
import { isNodeVersionIdentityOnly } from '../../lib/core/sync/syncNodeVersionHistory.js';

import { prepareImportedNodeDeletionVersions } from './importedNodeDeletionVersions.js';
import { closeLibraries, createPeer, edit, startLibraries } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

async function deletedHistory(body: string) {
  const source = createPeer('original');
  const initial = edit(source, body);
  source.db.exec("ATTACH DATABASE ':memory:' AS search");
  initializeWorkspaceSearchSidecar({ sqlite: source.db, driver: source.driver });
  const at = '2026-10-07T00:00:00.000Z';
  prepareImportedNodeDeletionVersions(source.driver, ['topic'], at);
  const version = source.db.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get() as string;
  deleteNodesPermanently(source.driver, { nodeIds: ['topic'], nodeOrder: [], deletedAt: at });
  const records = await loadRetainedSyncNodeVersionRecords(source.port, [initial, version]);
  const tombstone = records.get(version)!;
  return { source, tombstone, records: [...records.values()] };
}

it.each(['', 'Original body', '\ufeff中文😀' + 'x'.repeat(700_000)])(
  'retains complete original deletion bodies and immutable facts after obsolete caches are removed', async (body) => {
    const { source, tombstone, records } = await deletedHistory(body);
    source.db.exec('DROP TABLE content_blob_data; DROP TABLE content_blobs');
    const restored = await loadRetainedSyncNodeVersionRecords(source.port,
      [...records.map((record) => record.version_id!), tombstone.version_id!, 'missing']);
    expect(restored.size).toBe(records.length);
    expect(restored.get(tombstone.version_id!)).toEqual(tombstone);
    expect(restored.get(tombstone.version_id!)?.body_text).toBe(body);
    expect(hasCompleteTombstoneVersion(restored.get(tombstone.version_id!)!)).toBe(true);
  }
);

it.each([
  { label: 'empty body', body: '' }, { label: 'original body', body: 'Original body' },
  { label: 'large escaped body', body: '\ufeff"\\\t\u0000中文😀\r\n' + 'x'.repeat(700_000) }
])('recognizes a complete original deleted version with $label', async ({ body }) => {
  const { tombstone } = await deletedHistory(body);
  expect(tombstone.body_text).toBe(body);
  expect(hasCompleteTombstoneVersion(tombstone)).toBe(true);
  expect(hasCompleteTombstoneVersion({ ...tombstone, body_text: 'Different body' })).toBe(false);
  const withoutResources = { ...tombstone.snapshot };
  delete withoutResources.resource_references;
  expect(hasCompleteTombstoneVersion({ ...tombstone, snapshot: withoutResources })).toBe(false);

});

it.each(['desktop', 'companion'])('initializes the %s original deletion body summary once without changing facts', async (host) => {
  const { source, tombstone } = await deletedHistory('Original body');
  const tables = ['node_sync_versions', 'node_sync_tombstones', 'node_sync_version_parents',
    'sync_object_state', 'content_blob_data', 'framed_sync_outbound_holds'];
  const before = tables.map((table) => source.db.prepare(`SELECT * FROM ${table}`).all());
  const empty = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  source.db.prepare('UPDATE framed_sync_version_summary SET body_hash = ? WHERE version_id = ?')
    .run(empty, tombstone.version_id);
  source.db.prepare("UPDATE framed_sync_inventory SET resources_json = ? WHERE object_id = 'topic'")
    .run(JSON.stringify([empty]));
  if (host === 'desktop') {
    source.db.pragma('user_version = 144');
    initializeDatabaseSchema(source.db);
  } else await source.port.transaction((tx) => migrateCompanionDatabase(tx, 73, 74));
  const read = async () => (await readFramedSyncInventory(source.port))
    .find((item) => item.objectType === 'node' && item.globalId === 'topic')?.resourceHashes
    .map((hash) => Buffer.from(hash).toString('hex'));
  expect(await read()).toEqual([tombstone.snapshot.body_blob_hash]);
  expect(tables.map((table) => source.db.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
  source.db.prepare("UPDATE node_sync_tombstones SET created_at = created_at WHERE node_id = 'topic'").run();
  expect(await read()).toEqual([tombstone.snapshot.body_blob_hash]);
});

it.each([false, true])('keeps real versions and deletion when the old transport empty body arrives first=%s', async (emptyFirst) => {
  const { records, tombstone } = await deletedHistory('Original body');
  const receiver = createPeer('receiver');
  const old = restoreFramedSyncProjectedNodeRecord(projectFramedSyncNodeRecord({ ...tombstone, body_text: '' }));
  expect(hasCompleteTombstoneVersion(old)).toBe(false);
  const full = records.map((record) => isNodeVersionIdentityOnly(record)
    ? restoreFramedSyncNodeIdentityFact(projectFramedSyncNodeIdentityFact(record))
    : restoreFramedSyncProjectedNodeRecord(projectFramedSyncNodeRecord(record)));
  const apply = (incoming: typeof full) => applySyncNodesWithDbPort(receiver.port, incoming,
    { enqueueSearchInvalidations: false });
  if (emptyFirst) await apply([old]);
  await apply(full);
  if (!emptyFirst) await apply([old]);
  await apply(full);
  expect(receiver.db.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = ?")
    .pluck().get(tombstone.version_id)).toBe('Original body');
  expect(receiver.db.prepare("SELECT deleted_at FROM sync_object_state WHERE object_type = 'node' AND object_id = 'topic'")
    .pluck().get()).toBe(tombstone.snapshot.deleted_at);
  expect(receiver.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").all()).toEqual([]);
  expect(receiver.db.prepare('SELECT COUNT(*) FROM node_sync_version_parents').pluck().get()).toBe(1);
});

it('rejects a conflicting existing version without overwriting its body or deletion', async () => {
  const { records, tombstone } = await deletedHistory('Original body');
  const receiver = createPeer('receiver');
  await applySyncNodesWithDbPort(receiver.port, records, { enqueueSearchInvalidations: false });
  const tables = ['node_sync_versions', 'node_sync_tombstones', 'sync_object_state'];
  const before = tables.map((table) => receiver.db.prepare(`SELECT * FROM ${table}`).all());
  await expect(applySyncNodesWithDbPort(receiver.port, [{ ...tombstone, host_name: 'different-owner' }],
    { enqueueSearchInvalidations: false })).rejects.toThrow('sync_pack_node_version_immutable_mismatch');
  expect(tables.map((table) => receiver.db.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
});

it('fills an authenticated retired deletion version without reviving its node', async () => {
  const { records, tombstone } = await deletedHistory('Original body');
  const receiver = createPeer('receiver');
  const retired = restoreFramedSyncNodeIdentityFact(projectFramedSyncNodeIdentityFact({
    ...tombstone, is_tombstone: false, body_text: null,
    snapshot: { ...tombstone.snapshot, content: null }
  }));
  await applySyncNodesWithDbPort(receiver.port, [...records.filter((record) => record.version_id !== tombstone.version_id), retired],
    { enqueueSearchInvalidations: false });
  expect(receiver.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?')
    .pluck().get(tombstone.version_id)).toBeNull();
  const incomplete = restoreFramedSyncProjectedNodeRecord(projectFramedSyncNodeRecord({ ...tombstone, body_text: '' }));
  await applySyncNodesWithDbPort(receiver.port, [incomplete], { enqueueSearchInvalidations: false });
  expect(receiver.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?')
    .pluck().get(tombstone.version_id)).toBeNull();
  await applySyncNodesWithDbPort(receiver.port, [tombstone], { enqueueSearchInvalidations: false });
  expect(receiver.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?')
    .pluck().get(tombstone.version_id)).toBe('Original body');
  expect(receiver.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").all()).toEqual([]);
  expect((await readFramedSyncInventory(receiver.port)).find((item) => item.globalId === 'topic')
    ?.resourceHashes.map((hash) => Buffer.from(hash).toString('hex')))
    .toEqual([tombstone.snapshot.body_blob_hash]);
});
