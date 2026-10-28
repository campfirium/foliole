// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { replaceImportedHighlightNodes } from '../../lib/core/database/importPipelineHighlightNodes.js';
import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { applyNumberedSchemaMigrations } from '../../lib/core/database/numberedMigrations.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';

import { removeCurrentInventoryFixtureTriggers } from './historicalMigration.test-support.js';
import { prepareImportedNodeDeletionVersions } from './importedNodeDeletionVersions.js';
import { score } from './reviewProjection.testSupport.js';
import { closeLibraries, createPeer, edit, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { syncRequestLibrary as sync } from './syncRequestLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function relatedStates(peer: ReturnType<typeof createPeer>) {
  peer.db.exec("INSERT INTO node_reading (node_id, last_handled_at, next_at) VALUES ('topic', 'now', 'now')");
  upsertSyncObjectState(peer.driver, {
    objectType: 'node_reading', objectId: 'topic', contentHash: hashTextBody('old'), lastModifiedByHostName: peer.name,
    updatedAt: '2026-09-30T00:00:00.000Z', syncDirty: true
  });
  score({ sqlite: peer.db, id: peer.name }, 'review-first', '2026-09-30T00:00:00.000Z');
}

function learning(sqlite: Database.Database) {
  return {
    reading: sqlite.prepare('SELECT * FROM node_reading ORDER BY node_id').all(),
    reviews: sqlite.prepare('SELECT * FROM node_review ORDER BY node_id').all(),
    logs: sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all()
  };
}

it('records reading deletion and clears review facts and caches when permanently deleting their node', () => {
  const peer = createPeer('source');
  edit(peer, 'body');
  relatedStates(peer);
  peer.db.exec("ATTACH DATABASE ':memory:' AS search");
  initializeWorkspaceSearchSidecar({ sqlite: peer.db, driver: peer.driver });
  const deletedAt = '2026-10-01T00:00:00.000Z';
  prepareImportedNodeDeletionVersions(peer.driver, ['topic'], deletedAt);
  deleteNodesPermanently(peer.driver, { nodeIds: ['topic'], deletedAt });

  expect(peer.db.prepare(`SELECT object_type, deleted_at, sync_dirty FROM sync_object_state
    WHERE object_type IN ('node_reading', 'node_review') ORDER BY object_type`).all()).toEqual([
    { object_type: 'node_reading', deleted_at: deletedAt, sync_dirty: 1 }
  ]);
  expect(peer.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").all()).toEqual([]);
  expect(learning(peer.db)).toEqual({ reading: [], reviews: [], logs: [] });
  expect(peer.db.prepare("SELECT node_id FROM node_sync_tombstones").pluck().get()).toBe('topic');
});

it('preserves original versions, parents and member positions while upgrading state metadata', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  edit(source, 'protected body');
  await sync(source, target);
  const proofTables = ['node_sync_versions', 'node_sync_version_parents'];
  const before = proofTables.map((table) => source.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  expect(before[0]!.length).toBeGreaterThan(0);
  upsertSyncObjectState(source.driver, { objectType: 'node_reading', objectId: 'legacy-orphan',
    contentHash: hashTextBody('old'), lastModifiedByHostName: 'source', updatedAt: 'now', syncDirty: false });
  removeCurrentInventoryFixtureTriggers(source.db);
  source.db.pragma('user_version = 120');
  source.db.transaction(() => applyNumberedSchemaMigrations({ sqlite: source.db,
    currentVersion: 120, targetVersion: 121, legacyMessage: 'fixture_legacy_schema',
    setUserVersion: version => source.db.pragma(`user_version = ${version}`) }))();
  expect(proofTables.map((table) => source.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).toEqual(before);
  expect(source.db.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_id='legacy-orphan'").pluck().get()).toBe(0);
});

it('transfers reading deletion without a live node and ignores legacy review deletion metadata', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  for (const type of ['node_reading', 'node_review'] as const) upsertSyncObjectState(source.driver, {
    objectType: type, objectId: 'removed-node', contentHash: hashTextBody(`${type}-deleted`),
    lastModifiedByHostName: 'source', updatedAt: 'now', deletedAt: 'now', syncDirty: true
  });
  await sync(source, target);
  expect(target.db.prepare('SELECT object_type, deleted_at FROM sync_object_state ORDER BY object_type').all()).toEqual([
    { object_type: 'node_reading', deleted_at: 'now' }
  ]);
  expect(target.db.prepare("SELECT id FROM nodes WHERE id = 'removed-node'").get()).toBeUndefined();
  expect(learning(target.db)).toEqual({ reading: [], reviews: [], logs: [] });
});

it('retains imported highlights and learning facts when the new source omits them', () => {
  const peer = createPeer('source');
  edit(peer, 'body');
  peer.db.exec("UPDATE nodes SET is_title_manual = 0");
  relatedStates(peer);
  const before = learning(peer.db);

  replaceImportedHighlightNodes({ driver: peer.driver, highlights: [], importedAt: '2026-10-01',
    parentNodeId: 'parent', parentContent: '',
    prepareDeletionVersions: (ids, at) => prepareImportedNodeDeletionVersions(peer.driver, ids, at) });

  // The topic belongs to the root, so an unrelated replacement must preserve it.
  expect(peer.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").pluck().get()).toBe('topic');
  expect(learning(peer.db)).toEqual(before);
  peer.db.exec(`INSERT INTO nodes (id,title,created_at,updated_at) VALUES ('parent','Parent','now','now');
    UPDATE nodes SET parent_id = 'parent' WHERE id = 'topic';`);
  replaceImportedHighlightNodes({ driver: peer.driver, highlights: [], importedAt: '2026-10-01',
    parentNodeId: 'parent', parentContent: '',
    prepareDeletionVersions: (ids, at) => prepareImportedNodeDeletionVersions(peer.driver, ids, at) });
  expect(peer.db.prepare("SELECT node_id FROM node_sync_tombstones WHERE node_id='topic'").get()).toBeUndefined();
  expect(learning(peer.db)).toEqual(before);
  expect(peer.db.prepare(`SELECT object_type FROM sync_object_state WHERE object_id='topic'
    AND object_type IN ('node_reading','node_review') AND deleted_at IS NULL`).all()).toEqual([{ object_type: 'node_reading' }]);
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

it('preserves learning through soft deletion and clears it through permanent deletion, replay and reopen', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  edit(source, 'body', 'Card', null, 'item');
  relatedStates(source);
  const before = learning(source.db);
  expect(before.logs).toEqual([expect.objectContaining({ op_id: 'review-first', kind: 'review' })]);
  await sync(source, target);
  expect(target.db.prepare('SELECT node_id FROM node_review').pluck().get()).toBe('topic');
  expect(learning(target.db)).toEqual(before);
  prepareImportedNodeDeletionVersions(source.driver, ['topic'], '2026-10-01T00:00:00Z');
  await sync(source, target);
  for (const peer of [source, target]) expect(learning(peer.db)).toEqual(before);
  expect(target.db.prepare(`SELECT COUNT(*) FROM sync_object_state state
    WHERE object_type IN ('node_reading', 'node_review') AND deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM node_reading WHERE node_id=state.object_id)
    AND NOT EXISTS (SELECT 1 FROM node_review WHERE node_id=state.object_id)`).pluck().get()).toBe(0);
  source.db.exec("ATTACH DATABASE ':memory:' AS search");
  initializeWorkspaceSearchSidecar({ sqlite: source.db, driver: source.driver });
  const deletedAt = '2026-10-01T00:00:01Z';
  prepareImportedNodeDeletionVersions(source.driver, ['topic'], deletedAt);
  deleteNodesPermanently(source.driver, { nodeIds: ['topic'], deletedAt });
  await withLibraryRequestSnapshot(source, target, async replay => { await replay(); await replay(); });
  for (const peer of [source, target]) {
    const reopened = new Database(peer.file, { readonly: true, fileMustExist: true });
    try {
      expect(reopened.prepare(`SELECT object_type, deleted_at FROM sync_object_state
        WHERE object_type IN ('node_reading', 'node_review') ORDER BY object_type`).all())
        .toEqual([{ object_type: 'node_reading', deleted_at: deletedAt }]);
      expect(reopened.prepare("SELECT id FROM nodes WHERE id = 'topic'").all()).toEqual([]);
      expect(reopened.prepare('SELECT node_id, deleted_at FROM node_sync_tombstones').all())
        .toEqual([{ node_id: 'topic', deleted_at: deletedAt }]);
      expect(learning(reopened)).toEqual({ reading: [], reviews: [], logs: [] });
    } finally { reopened.close(); }
  }
});
