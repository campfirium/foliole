// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { seedNode } from '../../electron/database/nodeMutations.test.helpers.js';
import { saveNodeReadingState } from '../../electron/database/nodeReadingState.js';
import { drainDirtyNodeSyncVersions } from '../../electron/database/nodeSyncVersionDrain.js';
import { restoreNodesWithParents, softDeleteNodesWithParents } from '../../electron/database/nodeTrashTransitions.js';
import { parseRestoreNodesArgs, parseSoftDeleteNodesArgs } from '../../electron/ipc/nodeCommandArgs.js';
import { saveLocalCurrentParentOrder } from '../../lib/core/database/currentParentOrderStore.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { moveNodes } from '../../lib/core/database/nodeMoveMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { loadWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot.js';

import { createAwaitedWorkspaceHistoryActions, createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { createBrowserLocalWorkspaceMutationRepository, installWorkspaceMutationRepository, resetWorkspaceMutationRepository }
  from './workspaceMutationRepository';
import { createInitialWorkspaceState, useWorkspaceStore, type WorkspaceState } from './workspaceStore';
import { createDeleteNodesAction } from './workspaceStoreStructureDeleteAction';
import { createMoveNodesAction } from './workspaceStoreTreeActions';

let appDataDir = '';
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));
vi.mock('../../electron/ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../electron/foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));


beforeEach(async () => {
  appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-delete-order-'));
  initializeDatabase();
});
afterEach(async () => {
  resetWorkspaceMutationRepository();
  await drainDirtyNodeSyncVersions();
  closeDatabaseConnection();
  await fs.rm(appDataDir, { recursive: true, force: true });
});

it('undoes deletion after an unrelated parent is reordered and preserves both orders after reopening', async () => {
  const app = deleteHistoryOrderHarness();
  await app.remove(['x']);
  expect(await app.movePeer(['q2'], 'q1', 'before')).toBe(true);
  app.refresh();
  expect(await app.history.undoWorkspaceAction()).toBe(true);
  expect(app.children('p')).toEqual(['a', 'x', 'b', 'y']);
  expect(app.children('q')).toEqual(['q2', 'q1']);
  expect(await app.history.redoWorkspaceAction()).toBe(true);
  expect(app.children('p')).toEqual(['a', 'b', 'y']);
  expect(await app.history.undoWorkspaceAction()).toBe(true);
  await drainDirtyNodeSyncVersions();
  closeDatabaseConnection();
  expect(app.children('p')).toEqual(['a', 'x', 'b', 'y']);
  expect(app.children('q')).toEqual(['q2', 'q1']);
});

it('restores several noncontiguous targets while preserving a preexisting tombstone', async () => {
  const app = deleteHistoryOrderHarness();
  await app.remove(['b']);
  const oldTimestamp = app.get().trashedNodeDeletedAtById.b;
  await app.remove(['a', 'x']);
  app.reorder('p', ['y', 'b', 'a', 'x']);
  app.refresh();
  expect(await app.history.undoWorkspaceAction()).toBe(true);
  // The old next neighbor b still owns a hidden slot after y.
  expect(app.children('p')).toEqual(['y', 'a', 'x']);
  expect(app.get().trashedNodeDeletedAtById.b).toBe(oldTimestamp);
  expect(app.get().trashedNodeIds).toContain('b');
  expect(await app.history.redoWorkspaceAction()).toBe(true);
  expect(app.children('p')).toEqual(['y']);
});

it('rolls back a failed order write with the restore and permits retrying the same entry', async () => {
  const app = deleteHistoryOrderHarness();
  await app.remove(['x']);
  app.reorder('p', ['x', 'b', 'a', 'y']);
  app.refresh();
  const entry = app.get().appActionHistory.undoStack.at(-1)!;
  app.driver.execute(`CREATE TRIGGER reject_restore_order BEFORE UPDATE ON parent_child_order
    WHEN NEW.parent_id = 'p' BEGIN SELECT RAISE(ABORT, 'restore order failure'); END`);
  expect(await app.history.undoWorkspaceAction()).toBe(false);
  expect(app.get().appActionHistory.undoStack.at(-1)?.id).toBe(entry.id);
  expect(app.children('p')).toEqual(['b', 'a', 'y']);
  expect(app.driver.queryOne<{ deleted_at: string }>('SELECT deleted_at FROM nodes WHERE id = ?', ['x'])?.deleted_at).toBeTruthy();
  app.driver.execute('DROP TRIGGER reject_restore_order');
  expect(await app.history.undoWorkspaceAction()).toBe(true);
  expect(app.children('p')).toEqual(['b', 'a', 'x', 'y']);
});

it('restores a root-level node in its saved root sibling position', async () => {
  const app = deleteHistoryOrderHarness();
  const rootBefore = app.get().nodeOrder.filter(id => app.get().nodesById[id]?.parentNodeId === null);
  await app.remove(['p']);
  expect(await app.history.undoWorkspaceAction()).toBe(true);
  const rootAfter = app.get().nodeOrder.filter(id => app.get().nodesById[id]?.parentNodeId === null);
  expect(rootAfter).toEqual(rootBefore);
  expect(app.children('p')).toEqual(['a', 'x', 'b', 'y']);
});

it('restores the displayed folder manual order without overwriting current source settings', async () => {
  const app = deleteHistoryOrderHarness();
  saveNodeReadingState({ nodeId: 'a', updatedAt: ORDER_TIME, reading: { intervalDurationMs: 1000,
    intervalGrowthFactor: 1.5, lastHandledAt: ORDER_TIME, nextAt: '2030-01-01T00:00:00.000Z',
    priority: 3, readingPosition: 0.4, repetitionCount: 2, state: 'active' } });
  const reading = loadWorkspaceSnapshot(app.driver)!.nodesById.a?.reading;
  app.driver.execute("UPDATE nodes SET manual_child_order = ? WHERE id = 'p'", [JSON.stringify(['a', 'x', 'b', 'y'])]);
  app.refresh();
  await app.remove(['x']);
  app.driver.execute("UPDATE nodes SET manual_child_order = ? WHERE id = 'p'", [JSON.stringify(['b', 'a', 'y'])]);
  app.refresh();
  expect(await app.history.undoWorkspaceAction()).toBe(true);
  expect(loadWorkspaceSnapshot(app.driver)!.nodesById.p?.manualChildOrder).toEqual(['b', 'a', 'x', 'y']);
  expect(app.get().nodesById.p?.manualChildOrder).toEqual(['b', 'a', 'x', 'y']);
  expect(loadWorkspaceSnapshot(app.driver)!.nodesById.a?.reading).toEqual(reading);
  expect(await app.history.redoWorkspaceAction()).toBe(true);
  expect(await app.history.undoWorkspaceAction()).toBe(true);
  expect(app.get().nodesById.p?.manualChildOrder).toEqual(['b', 'a', 'x', 'y']);
});

it('queues undo behind a pending delete and never consumes an older action', async () => {
  const app = deleteHistoryOrderHarness();
  const persist = app.repository.syncSoftDeleteNodes;
  let release!: () => void;
  app.repository.syncSoftDeleteNodes = async args => {
    await new Promise<void>(resolve => { release = resolve; });
    return persist(args);
  };
  const pending = app.remove(['x']);
  expect(await app.history.undoWorkspaceAction()).toBe(true);
  expect(app.get().appActionHistory.pendingAction?.undoRequested).toBe(true);
  release();
  await pending;
  await vi.waitFor(() => expect(app.get().appActionHistory.redoStack).toHaveLength(1));
  expect(app.children('p')).toEqual(['a', 'x', 'b', 'y']);
});

it('keeps a later unrelated renderer order while an undo receipt is pending', async () => {
  const app = deleteHistoryOrderHarness();
  await app.remove(['x']);
  let release!: () => void;
  installWorkspaceMutationRepository({ ...app.repository, syncRestoreNodes: async args => {
    const result = await app.repository.syncRestoreNodes(args);
    await new Promise<void>(resolve => { release = resolve; });
    return result;
  } });
  const undo = app.history.undoWorkspaceAction();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  expect(await app.movePeer(['q2'], 'q1', 'before')).toBe(true);
  const nodeOrder = [...app.get().nodeOrder];
  const positions = nodeOrder.flatMap((id, index) => ['q1', 'q2'].includes(id) ? [index] : []);
  positions.forEach((position, index) => { nodeOrder[position] = ['q2', 'q1'][index]!; });
  app.set({ nodeOrder });
  release();
  expect(await undo).toBe(true);
  expect(app.children('p')).toEqual(['a', 'x', 'b', 'y']);
  expect(app.children('q')).toEqual(['q2', 'q1']);
  expect(app.get().nodeOrder.filter(id => ['q1', 'q2'].includes(id))).toEqual(['q2', 'q1']);
});

it('restores next to an original sibling after the parent changes without rewinding its current children', async () => {
  const app = deleteHistoryOrderHarness();
  await app.remove(['x']);
  app.reorder('p', ['b', 'y', 'a', 'x']);
  app.refresh();
  expect(await app.history.undoWorkspaceAction()).toBe(true);
  expect(app.children('p')).toEqual(['b', 'y', 'a', 'x']);
  const order = app.get().nodeOrder.filter(id => app.get().nodesById[id]?.parentNodeId === 'p');
  expect(order).toEqual(app.children('p'));
});

it('uses the saved predecessor when a hidden slot was moved far away', async () => {
  const app = deleteHistoryOrderHarness();
  await app.remove(['x']);
  app.reorder('p', ['x', 'b', 'a', 'y']);
  app.refresh();
  expect(await app.history.undoWorkspaceAction()).toBe(true);
  expect(app.children('p')).toEqual(['b', 'a', 'x', 'y']);
  expect(app.get().nodesById.leaf?.parentNodeId).toBe('x');
  expect(await app.history.redoWorkspaceAction()).toBe(true);
  expect(app.children('p')).toEqual(['b', 'a', 'y']);
});

const ORDER_TIME = '2026-10-29T02:00:00.000Z';

function deleteHistoryOrderHarness() {
  const members: Array<[string, string | null]> = [
    ['p', null], ['q', null], ['a', 'p'], ['x', 'p'], ['b', 'p'], ['y', 'p'],
    ['leaf', 'x'], ['q1', 'q'], ['q2', 'q']
  ];
  members.forEach(([id, parent], index) => seedNode(id, parent, index));
  const driver = openDatabaseConnection().driver;
  driver.execute("UPDATE nodes SET kind = 'folder' WHERE id IN ('p', 'q')");
  const reorder = (parentId: string, childIds: string[]) => saveLocalCurrentParentOrder(driver,
    { parentId, childIds, now: ORDER_TIME, hostName: 'delete-order' });
  reorder('p', ['a', 'x', 'b', 'y']);
  let state: WorkspaceState = { ...useWorkspaceStore.getState(), ...createInitialWorkspaceState(),
    ...loadDeleteOrderSnapshot(driver), isHydrated: true };
  const set = (patch: Partial<WorkspaceState> | ((current: WorkspaceState) => Partial<WorkspaceState>)) => {
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  };
  const repository = { ...createBrowserLocalWorkspaceMutationRepository(),
    syncSoftDeleteNodes: async (args: Parameters<typeof softDeleteNodesWithParents>[0]) => {
      softDeleteNodesWithParents(parseSoftDeleteNodesArgs({ ...args }));
      return { deletedNodeIds: args.nodeIds };
    },
    syncRestoreNodes: async (args: Parameters<typeof restoreNodesWithParents>[0]) =>
      restoreNodesWithParents(parseRestoreNodesArgs({ ...args })) };
  installWorkspaceMutationRepository(repository);
  const remove = createDeleteNodesAction(set, repository, () => state);
  const history = createAwaitedWorkspaceHistoryActions(set, () => state);
  set(createWorkspaceActionHistoryActions(set, () => state));
  const refresh = () => set(loadDeleteOrderSnapshot(openDatabaseConnection().driver));
  const children = (parent: string) => {
    const snapshot = loadWorkspaceSnapshot(openDatabaseConnection().driver)!;
    return snapshot.nodeOrder.filter(id => snapshot.nodesById[id]?.parentNodeId === parent &&
      !snapshot.trashedNodeIds.includes(id));
  };

  return { children, driver, get: () => state, history, movePeer: createPeerMove(() => state), refresh, remove, reorder, repository, set };
}

function createPeerMove(get: () => WorkspaceState) {
  return async (nodeIds: string[], targetId: string, position: 'before' | 'after') => {
    const file = openDatabaseConnection().dbPath;
    const database = new Database(file);
    const peer = createBetterSqlite3Driver(database);
    bindParentOrderWriter(peer, { deviceAnchor: 'delete-order-peer', libraryPath: file });
    let peerState: WorkspaceState = { ...get(), ...loadDeleteOrderSnapshot(peer) };
    const setPeer = (patch: Partial<WorkspaceState> | ((current: WorkspaceState) => Partial<WorkspaceState>)) => {
      peerState = { ...peerState, ...(typeof patch === 'function' ? patch(peerState) : patch) };
    };
    try {
      return await createMoveNodesAction(setPeer, async payload => moveNodes(peer, payload))(nodeIds, targetId, position);
    } finally { database.close(); }
  };
}

function loadDeleteOrderSnapshot(driver: DatabaseDriver) {
  const snapshot = loadWorkspaceSnapshot(driver)!;
  return { ...snapshot, nodesById: Object.fromEntries(Object.entries(snapshot.nodesById).map(([id, node]) =>
    [id, { ...node, anchorLink: null }])) };
}
