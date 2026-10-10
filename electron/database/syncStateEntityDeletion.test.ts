// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { replaceImportedHighlightNodes } from '../../lib/core/database/importPipelineHighlightNodes.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS as definitions } from '../../lib/core/sync/androidSyncPackProviderDefinitions.js';

import { copyPayloads } from './androidSyncPackProviderDefinitions.testSupport.js';
import { removeCurrentInventoryFixtureTriggers } from './historicalMigration.test-support.js';
import { prepareImportedNodeDeletionVersions } from './importedNodeDeletionVersions.js';
import { buildPack, closeLibraries, createPeer, edit, joinPeers, receivePack, startLibraries, sync } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function relatedStates(peer: ReturnType<typeof createPeer>) {
  peer.db.exec(`INSERT INTO node_reading (node_id, last_handled_at, next_at) VALUES ('topic', 'now', 'now');
    INSERT INTO node_review (node_id, due) VALUES ('topic', 'now');`);
  for (const type of ['node_reading', 'node_review'] as const) upsertSyncObjectState(peer.driver, {
    objectType: type, objectId: 'topic', contentHash: 'old', lastModifiedByHostName: peer.name,
    updatedAt: '2026-09-30T00:00:00.000Z', syncDirty: true
  });
}

it('records reading and review deletion facts when permanently deleting their node', () => {
  const peer = createPeer('source');
  edit(peer, 'body');
  relatedStates(peer);
  peer.db.exec("ATTACH DATABASE ':memory:' AS search");
  initializeWorkspaceSearchSidecar({ sqlite: peer.db, driver: peer.driver });
  const deletedAt = '2026-10-01T00:00:00.000Z';
  prepareImportedNodeDeletionVersions(peer.driver, ['topic'], deletedAt);
  deleteNodesPermanently(peer.driver, { nodeIds: ['topic'], nodeOrder: [], deletedAt });

  expect(peer.db.prepare(`SELECT object_type, deleted_at, sync_dirty FROM sync_object_state
    WHERE object_type IN ('node_reading', 'node_review') ORDER BY object_type`).all()).toEqual([
    { object_type: 'node_reading', deleted_at: deletedAt, sync_dirty: 1 },
    { object_type: 'node_review', deleted_at: deletedAt, sync_dirty: 1 }
  ]);
  expect(peer.db.prepare("SELECT node_id FROM node_sync_tombstones").pluck().get()).toBe('topic');
});

it('preserves production version delivery proofs and retained bodies while upgrading state metadata', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  edit(source, 'protected body');
  await sync(source, target);
  const proofTables = ['node_version_confirmation_state', 'node_version_device_bases', 'node_sync_versions'];
  const before = proofTables.map((table) => source.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  expect(before[0]!.length).toBeGreaterThan(0);
  upsertSyncObjectState(source.driver, { objectType: 'node_review', objectId: 'legacy-orphan',
    contentHash: 'old', lastModifiedByHostName: 'source', updatedAt: 'now', syncDirty: false });
  removeCurrentInventoryFixtureTriggers(source.db);
  source.db.pragma('user_version = 120');
  initializeDatabaseSchema(source.db);
  expect(proofTables.map((table) => source.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).toEqual(before);
  expect(source.db.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_id='legacy-orphan'").pluck().get()).toBe(0);
});

it('includes learning deletion facts without a node entity in the native companion provider', () => {
  const source = createPeer('source');
  for (const type of ['node_reading', 'node_review'] as const) upsertSyncObjectState(source.driver, {
    objectType: type, objectId: 'removed-node', contentHash: `${type}-deleted`,
    lastModifiedByHostName: 'source', updatedAt: 'now', deletedAt: 'now', syncDirty: true
  });
  const pack = new Database(':memory:');
  try {
    for (const statement of definitions.packSchema) pack.exec(statement);
    pack.prepare('ATTACH DATABASE ? AS source').run(source.file);
    definitions.copyStatements.forEach((statement, index) => {
      if (index === definitions.stateCopyIndex) pack.prepare(statement).run(0, 100);
      else {
        if (index === definitions.payloadCopyIndex) copyPayloads(pack);
        pack.exec(statement);
      }
    });
    expect(pack.prepare('SELECT object_type, deleted_at FROM sync_object_state ORDER BY object_type').all()).toEqual([
      { object_type: 'node_reading', deleted_at: 'now' }, { object_type: 'node_review', deleted_at: 'now' }
    ]);
  } finally { pack.close(); }
});

it('keeps deletion facts for discarded imported highlights and does not tombstone replacement identities', () => {
  const peer = createPeer('source');
  edit(peer, 'body');
  peer.db.exec("UPDATE nodes SET is_title_manual = 0");
  relatedStates(peer);

  replaceImportedHighlightNodes({ driver: peer.driver, highlights: [], importedAt: '2026-10-01',
    parentNodeId: 'parent', parentContent: '',
    prepareDeletionVersions: (ids, at) => prepareImportedNodeDeletionVersions(peer.driver, ids, at) });

  // The topic belongs to the root, so an unrelated replacement must preserve it.
  expect(peer.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").pluck().get()).toBe('topic');
  peer.db.exec(`INSERT INTO nodes (id,title,created_at,updated_at) VALUES ('parent','Parent','now','now');
    UPDATE nodes SET parent_id = 'parent' WHERE id = 'topic';`);
  replaceImportedHighlightNodes({ driver: peer.driver, highlights: [], importedAt: '2026-10-01',
    parentNodeId: 'parent', parentContent: '',
    prepareDeletionVersions: (ids, at) => prepareImportedNodeDeletionVersions(peer.driver, ids, at) });
  expect(peer.db.prepare("SELECT node_id FROM node_sync_tombstones WHERE node_id='topic'").pluck().get()).toBe('topic');
  expect(peer.db.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_id='topic' AND deleted_at IS NULL")
    .pluck().get()).toBe(0);
});

it('does not create a node tombstone for a highlight identity rebuilt by the same import', () => {
  const peer = createPeer('source');
  edit(peer, 'body');
  peer.db.exec(`INSERT INTO nodes (id,title,created_at,updated_at) VALUES ('parent','Parent','now','now');
    UPDATE nodes SET parent_id = 'parent', is_title_manual = 0 WHERE id = 'topic';`);
  replaceImportedHighlightNodes({ driver: peer.driver,
    highlights: [{ anchorId: 'anchor', content: 'body', kind: 'highlight', label: null, nodeId: 'topic' }],
    importedAt: '2026-10-01', parentNodeId: 'parent', parentContent: 'body',
    prepareDeletionVersions: (ids, at) => prepareImportedNodeDeletionVersions(peer.driver, ids, at) });
  expect(peer.db.prepare("SELECT id FROM nodes WHERE id='topic'").pluck().get()).toBe('topic');
  expect(peer.db.prepare("SELECT node_id FROM node_sync_tombstones WHERE node_id='topic'").get()).toBeUndefined();
});

it('does not persist live learning states after pack apply removes their deleted node learning rows', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  edit(source, 'body', 'Card', null, 'item');
  relatedStates(source);
  await receivePack(source, target, await buildPack(source, target));
  expect(target.db.prepare('SELECT node_id FROM node_review').pluck().get()).toBe('topic');
  prepareImportedNodeDeletionVersions(source.driver, ['topic'], '2026-10-01T00:00:00Z');
  await receivePack(source, target, await buildPack(source, target));
  expect(target.db.prepare('SELECT COUNT(*) FROM node_review').pluck().get()).toBe(0);
  expect(target.db.prepare(`SELECT COUNT(*) FROM sync_object_state state
    WHERE object_type IN ('node_reading', 'node_review') AND deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM node_reading WHERE node_id=state.object_id)
    AND NOT EXISTS (SELECT 1 FROM node_review WHERE node_id=state.object_id)`).pluck().get()).toBe(0);
  source.db.exec("ATTACH DATABASE ':memory:' AS search");
  initializeWorkspaceSearchSidecar({ sqlite: source.db, driver: source.driver });
  const deletedAt = '2026-10-01T00:00:01Z';
  prepareImportedNodeDeletionVersions(source.driver, ['topic'], deletedAt);
  deleteNodesPermanently(source.driver, { nodeIds: ['topic'], nodeOrder: [], deletedAt });
  const deletionPack = await buildPack(source, target);
  await receivePack(source, target, deletionPack);
  await receivePack(source, target, deletionPack);
  const reopened = new Database(target.file, { readonly: true });
  try {
    expect(reopened.prepare(`SELECT object_type, deleted_at FROM sync_object_state
      WHERE object_type IN ('node_reading', 'node_review') ORDER BY object_type`).all()).toEqual([
      { object_type: 'node_reading', deleted_at: deletedAt },
      { object_type: 'node_review', deleted_at: deletedAt }
    ]);
    expect(reopened.prepare('SELECT COUNT(*) FROM node_review').pluck().get()).toBe(0);
    expect(reopened.prepare('SELECT COUNT(*) FROM node_reading').pluck().get()).toBe(0);
  } finally { reopened.close(); }
});
