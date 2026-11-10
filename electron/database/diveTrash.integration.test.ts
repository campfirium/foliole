// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { restoreNodes, softDeleteNodes, upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';

import { createDive, listDives } from './diveRepository.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { closeLibraries, createPeer, joinPeers, startLibraries, type Peer } from './syncLibrary.testSupport.js';
import { syncRequestLibrary } from './syncRequestLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function seedSource(peer: Peer, now: string) {
  for (const [nodeId, parentNodeId, kind] of [['folder', null, 'folder'], ['topic', 'folder', 'topic']] as const) {
    upsertNodeSnapshot(peer.driver, { nodeId, parentNodeId, kind, title: nodeId, content: kind === 'topic' ? 'Body' : '',
      reveal: null, anchorLink: null, position: null, isTitleManual: true, createdAt: now, updatedAt: now, hostName: peer.name });
    flushNodeSyncVersionWithDriver(peer.driver, nodeId, peer.name, now);
  }
  saveNodeReadingStateWithSync(peer.driver, { nodeId: 'topic', hostName: peer.name, updatedAt: now,
    reading: { intervalDurationMs: 12000, intervalGrowthFactor: 1.5, lastHandledAt: now, nextAt: now,
      priority: 3, readingPosition: 0.42, repetitionCount: 2, state: 'active' } });
}

function readPersisted(peer: Peer, diveId: string) {
  const db = new Database(peer.file, { readonly: true });
  try {
    return {
      dives: listDives(db),
      dive: db.prepare('SELECT deleted_at, manual_child_order FROM nodes WHERE id = ?').get(diveId),
      materials: db.prepare("SELECT id, parent_id, deleted_at, content FROM nodes WHERE id IN ('folder', 'topic') ORDER BY id").all(),
      reading: db.prepare("SELECT repetition_count FROM node_reading WHERE node_id = 'topic'").get()
    };
  } finally { db.close(); }
}

function flushTrashTransition(peer: Peer, id: string) {
  peer.db.prepare('UPDATE nodes SET sync_dirty = 1 WHERE id = ?').run(id);
  flushNodeSyncVersionWithDriver(peer.driver, id, peer.name, new Date().toISOString());
}

it('synchronizes Dive trash, restore and permanent deletion without changing referenced materials or learning', async () => {
  const desktop = createPeer('source');
  const receiver = createPeer('target');
  joinPeers(desktop, receiver);
  desktop.db.exec("ATTACH DATABASE ':memory:' AS search");
  initializeWorkspaceSearchSidecar({ sqlite: desktop.db, driver: desktop.driver });
  const now = new Date().toISOString();
  seedSource(desktop, now);
  const dive = createDive(desktop.db, 'Referenced sources', ['folder', 'topic']);
  await syncRequestLibrary(desktop, receiver);
  const before = readPersisted(receiver, dive.id);
  expect(before.dives).toEqual([dive]);
  expect(before.reading).toEqual({ repetition_count: 2 });

  const nodeIds = [dive.id];
  const deletedAt = new Date().toISOString();
  softDeleteNodes(desktop.driver, { nodeIds, deletedAt });
  flushTrashTransition(desktop, dive.id);
  await syncRequestLibrary(desktop, receiver);
  for (const peer of [desktop, receiver]) expect(readPersisted(peer, dive.id)).toEqual({
    ...before, dives: [], dive: { deleted_at: deletedAt, manual_child_order: JSON.stringify(dive.directSourceIds) }
  });

  expect(restoreNodes(desktop.driver, { nodeIds }).restoredNodeIds).toEqual(nodeIds);
  flushTrashTransition(desktop, dive.id);
  await syncRequestLibrary(desktop, receiver);
  for (const peer of [desktop, receiver]) expect(readPersisted(peer, dive.id)).toEqual(before);

  softDeleteNodes(desktop.driver, { nodeIds, deletedAt });
  flushTrashTransition(desktop, dive.id);
  deleteNodesPermanently(desktop.driver, { nodeIds, deletedAt });
  await syncRequestLibrary(desktop, receiver);
  for (const peer of [desktop, receiver]) expect(readPersisted(peer, dive.id)).toEqual({
    ...before, dives: [], dive: undefined
  });
});
