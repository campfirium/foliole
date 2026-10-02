// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { restoreNodes, softDeleteNodes, upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { loadWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot.js';
import { pruneLearningRowsWithoutVisibleNodes } from '../../lib/core/sync/syncNodeVisibilityPruning.js';

import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { closeLibraries, createPeer, edit, joinPeers, startLibraries, sync, type Peer } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);
const DELETED_AT = '2026-10-01T00:00:00.000Z';

function saveReading(peer: Peer, nodeId = 'topic') {
  saveNodeReadingStateWithSync(peer.driver, { nodeId, hostName: peer.name,
    updatedAt: '2026-09-30T00:30:00.000Z', reading: {
      intervalDurationMs: 12000, intervalGrowthFactor: 1.5,
      lastHandledAt: '2026-09-30T00:30:00.000Z', nextAt: '2026-10-02T00:00:00.000Z',
      priority: 3, readingPosition: 0.42, repetitionCount: 2, state: 'active'
    } });
}

function persistedReading(peer: Peer) {
  const reopened = new Database(peer.file, { readonly: true });
  try {
    return { reading: reopened.prepare('SELECT * FROM node_reading ORDER BY node_id').all(),
      positions: reopened.prepare('SELECT * FROM node_reading_host_state ORDER BY node_id, host_name').all() };
  } finally { reopened.close(); }
}

it('retains reading and host position through remote Trash, unrelated sync and restore', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  edit(source, 'Body');
  await sync(source, target);
  saveReading(source);
  saveReading(target);
  const before = [persistedReading(source), persistedReading(target)];
  softDeleteNodes(source.driver, { nodeIds: ['topic'], deletedAt: DELETED_AT });
  source.db.prepare('UPDATE nodes SET sync_dirty = 1 WHERE id = ?').run('topic');
  flushNodeSyncVersionWithDriver(source.driver, 'topic', source.name, DELETED_AT);
  await sync(source, target);
  for (const [index, peer] of [source, target].entries()) {
    expect(peer.db.prepare('SELECT deleted_at FROM nodes WHERE id = ?').pluck().get('topic')).toBe(DELETED_AT);
    await pruneLearningRowsWithoutVisibleNodes(peer.port);
    expect(persistedReading(peer)).toEqual(before[index]);
    expect(loadWorkspaceSnapshot(peer.driver)?.nodesById.topic?.reading).toBeNull();
  }
  restoreNodes(source.driver, { nodeIds: ['topic'] });
  source.db.prepare('UPDATE nodes SET sync_dirty = 1 WHERE id = ?').run('topic');
  flushNodeSyncVersionWithDriver(source.driver, 'topic', source.name, new Date().toISOString());
  await sync(source, target);
  for (const [index, peer] of [source, target].entries()) {
    expect(peer.db.prepare('SELECT deleted_at FROM nodes WHERE id = ?').pluck().get('topic')).toBeNull();
    expect(persistedReading(peer)).toEqual(before[index]);
    expect(loadWorkspaceSnapshot(peer.driver)?.nodesById.topic?.reading).toMatchObject({ readingPosition: 0.42, repetitionCount: 2 });
  }
});

it('retains descendant progress while its parent is in Trash', async () => {
  const peer = createPeer('source');
  edit(peer, 'Parent');
  upsertNodeSnapshot(peer.driver, { nodeId: 'child', parentNodeId: 'topic', kind: 'topic',
    isTitleManual: true, reveal: null, anchorLink: null, position: 0,
    title: 'Child', content: 'Child body', updatedAt: DELETED_AT, createdAt: DELETED_AT });
  saveReading(peer, 'child');
  const before = persistedReading(peer);
  softDeleteNodes(peer.driver, { nodeIds: ['topic'], deletedAt: DELETED_AT });
  await pruneLearningRowsWithoutVisibleNodes(peer.port);
  expect(persistedReading(peer)).toEqual(before);
  restoreNodes(peer.driver, { nodeIds: ['topic'] });
  expect(persistedReading(peer)).toEqual(before);
});

it('clears inactive orphan flags without discarding valid progress or deletion records', async () => {
  const peer = createPeer('source');
  edit(peer, 'Body');
  saveReading(peer);
  peer.db.exec("ATTACH DATABASE ':memory:' AS search");
  initializeWorkspaceSearchSidecar({ sqlite: peer.db, driver: peer.driver });
  peer.db.prepare('DELETE FROM node_reading').run();
  peer.db.prepare('DELETE FROM node_reading_host_state').run();
  await pruneLearningRowsWithoutVisibleNodes(peer.port);
  expect(peer.db.prepare("SELECT sync_dirty FROM sync_object_state WHERE object_type = 'node_reading'").pluck().get()).toBe(1);
  softDeleteNodes(peer.driver, { nodeIds: ['topic'], deletedAt: DELETED_AT });
  await pruneLearningRowsWithoutVisibleNodes(peer.port);
  expect(peer.db.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_type = 'node_reading'").pluck().get()).toBe(0);
  saveReading(peer);
  deleteNodesPermanently(peer.driver, { nodeIds: ['topic'], nodeOrder: [], deletedAt: DELETED_AT });
  await pruneLearningRowsWithoutVisibleNodes(peer.port);
  expect(persistedReading(peer)).toEqual({ reading: [], positions: [] });
  expect(peer.db.prepare("SELECT deleted_at FROM sync_object_state WHERE object_type = 'node_reading'").pluck().get()).toBe(DELETED_AT);
});
