// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver';
import { closeLibraries, createPeer, joinPeers, startLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { syncRequestLibrary } from '../../electron/database/syncRequestLibrary.testSupport';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState';
import { loadWorkspaceListSnapshot } from '../../lib/core/database/workspaceListSnapshot';
import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning';
import { createDismissEntireTopicAction } from '../features/nodes/components/nodeListMenuActions';
import type { Node } from '../features/nodes/model/nodeTypes';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { installWorkspaceHistoryPersistence, resetWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import { runtimeWorkspaceReviewPersistence } from './workspaceReviewPersistence';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';
import { createDismissNodesAction } from './workspaceStoreNodeDismissAction';

const now = '2026-10-28T12:00:00.000Z';
afterEach(async () => {
  resetWorkspaceHistoryPersistence();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await closeLibraries();
});

function seed(peer: Peer, id: string, parentNodeId: string | null, kind: 'topic' | 'item' = 'topic') {
  upsertNodeSnapshot(peer.driver, { nodeId: id, parentNodeId, kind, title: id,
    content: `Saved ${id}`, reveal: kind === 'item' ? 'Answer' : null, anchorLink: null,
    position: null, isTitleManual: true, createdAt: now, updatedAt: now, hostName: peer.name });
  flushNodeSyncVersionWithDriver(peer.driver, id, peer.name, now);
}

// The child already has reading progress, so undo puts back an older profile instead of deleting one.
const childReading = { intervalDurationMs: 86_400_000, intervalGrowthFactor: 2, lastHandledAt: '2026-10-20T00:00:00.000Z',
  nextAt: '2026-10-30T00:00:00.000Z', priority: 50, readingPosition: 3, repetitionCount: 4, state: 'active' as const };

function seedProgress(peer: Peer) {
  saveNodeReadingStateWithSync(peer.driver, { nodeId: 'child', hostName: peer.name, reading: childReading,
    updatedAt: childReading.lastHandledAt });
}

function readSaved(peer: Peer, dismissed: boolean) {
  const reopened = new Database(peer.file, { readonly: true });
  try {
    const rows = reopened.prepare(`SELECT n.id,n.content,n.parent_id,r.state,r.repetition_count FROM nodes n
      LEFT JOIN node_reading r ON r.node_id=n.id`).all() as
      Array<{ id: string; content: string; parent_id: string | null; state: string | null; repetition_count: number | null }>;
    for (const id of ['root', 'child', 'deep']) {
      const row = rows.find(value => value.id === id)!;
      expect(row.content).toBe(`Saved ${id}`);
      expect(row.state).toBe(dismissed ? 'dismissed' : id === 'child' ? 'active' : null);
    }
    expect(rows.find(row => row.id === 'child')!.repetition_count).toBe(4);
    expect(rows.find(row => row.id === 'card')!.state).toBeNull();
    expect(rows.find(row => row.id === 'other')!.state).toBeNull();
    expect(rows.find(row => row.id === 'deep')!.parent_id).toBe('card');
  } finally { reopened.close(); }
}

it('persists one menu subtree operation, undo and redo through runtime reading writes and independent-peer sync', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  await startLibraries();
  const local = createPeer('local');
  const remote = createPeer('remote');
  joinPeers(local, remote);
  seed(local, 'root', null);
  seed(local, 'child', 'root');
  seed(local, 'card', 'root', 'item');
  seed(local, 'deep', 'card');
  seed(local, 'other', null);
  seedProgress(local);
  const sync = async () => {
    await syncRequestLibrary(local, remote);
    await syncRequestLibrary(remote, local);
  };
  await sync();
  const snapshot = loadWorkspaceListSnapshot(local.driver)!;
  const app = createWorkspaceNodeActionsSetStateHarness({ ...createWorkspaceNodeActionsFixture(),
    ...snapshot, nodesById: snapshot.nodesById as Record<string, Node>, isHydrated: true, libraryScope: local.file });
  const writes: string[] = [];
  // Substitute only transport/host selection; retain production renderer persistence and core driver writes.
  vi.stubGlobal('window', { electronAPI: { invoke: async (command: string, input: {
    nodeId: string; nodeIds: string[]; libraryScope: string; reading: NonNullable<Node['reading']> | null; updatedAt: string;
  }) => {
    if (command === 'load_node_learning') {
      expect(input.libraryScope).toBe(local.file);
      return readWorkspaceNodeLearning(local.driver, input.nodeIds);
    }
    if (command !== 'save_node_reading_state') throw new Error(`unexpected_command:${command}`);
    writes.push(input.nodeId);
    saveNodeReadingStateWithSync(local.driver, { ...input, hostName: local.name });
    return null;
  } } });
  installWorkspaceHistoryPersistence({ persistNodeSnapshots: async () => { throw new Error('whole_node_write'); },
    persistReadingSnapshots: (nodes, updatedAt, historyOrder) =>
      runtimeWorkspaceReviewPersistence.persistReadingNodes(nodes, updatedAt, undefined, historyOrder),
    persistReviewSnapshot: async () => { throw new Error('review_write'); },
    persistShelveSnapshots: async () => { throw new Error('shelve_write'); } });
  const dismiss = createDismissNodesAction(app.setState, app.getState);
  const history = createWorkspaceActionHistoryActions(app.setState, app.getState);
  createDismissEntireTopicAction('root', dismiss, () => undefined)();
  await expect.poll(() => app.getState().appActionHistory.undoStack.length).toBe(1);
  expect(writes).toEqual(['root', 'child', 'deep']);
  await sync();
  readSaved(local, true);
  readSaved(remote, true);
  vi.setSystemTime(new Date(Date.parse(now) + 1000));
  expect(history.undoWorkspaceAction()).toBe(true);
  await expect.poll(() => app.getState().appActionHistory.redoStack.length).toBe(1);
  await sync();
  readSaved(local, false);
  readSaved(remote, false);
  vi.setSystemTime(new Date(Date.parse(now) + 2000));
  expect(history.redoWorkspaceAction()).toBe(true);
  await expect.poll(() => app.getState().appActionHistory.undoStack.length).toBe(1);
  await sync();
  readSaved(local, true);
  readSaved(remote, true);
});
