// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import { saveLocalCurrentParentOrder } from '../../lib/core/database/currentParentOrderStore.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { moveNodes } from '../../lib/core/database/nodeMoveMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { loadWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot.js';

import { createEmptyWorkspaceActionHistory } from './workspaceActionHistory';
import { createBrowserLocalWorkspaceMutationRepository, installWorkspaceMutationRepository,
  resetWorkspaceMutationRepository } from './workspaceMutationRepository';
import { createInitialWorkspaceState, useWorkspaceStore, type WorkspaceState } from './workspaceStore';
import { createMoveNodesAction } from './workspaceStoreTreeActions';
import { applyWorkspaceStructureHistory, isWorkspaceStructureHistoryApplicable } from './workspaceStructureHistoryApply';
import type { WorkspaceStructureMoveEntry } from './workspaceStructureHistoryTypes';

const moveHistoryTime = '2026-10-28T02:00:00.000Z';

function createMoveHistoryDatabase() {
  const root = mkdtempSync(path.join(tmpdir(), 'foliole-move-history-'));
  const file = path.join(root, 'library.db');
  const database = new Database(file);
  initializeDatabaseSchema(database);
  const driver = createBetterSqlite3Driver(database);
  driver.execute("INSERT INTO settings VALUES ('host_name', ?, ?)", ['"move-history"', moveHistoryTime]);
  bindParentOrderWriter(driver, { deviceAnchor: 'move-history', libraryPath: file });
  for (const [id, parent] of [['p', null], ['q', null], ['u', null], ['a', 'p'], ['x', 'p'],
    ['b', 'p'], ['y', 'p'], ['leaf-a', 'a'], ['leaf-b', 'b'], ['u1', 'u'], ['u2', 'u']] as const) {
    driver.execute(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
      VALUES (?, ?, 'folder', ?, '', ?, ?)`, [id, parent, id, moveHistoryTime, moveHistoryTime]);
  }
  for (const [parentId, childIds] of [['p', ['a', 'x', 'b', 'y']], ['u', ['u1', 'u2']]] as const) {
    saveLocalCurrentParentOrder(driver, { parentId, childIds: [...childIds], now: moveHistoryTime,
      hostName: 'move-history' });
  }
  const peerDatabase = new Database(file);
  const peer = createBetterSqlite3Driver(peerDatabase);
  const snapshot = loadWorkspaceSnapshot(driver)!;
  let state: WorkspaceState = { ...useWorkspaceStore.getState(), ...createInitialWorkspaceState(),
    ...snapshot, nodesById: Object.fromEntries(Object.entries(snapshot.nodesById).map(([id, node]) =>
      [id, { ...node, anchorLink: null }])), appActionHistory: createEmptyWorkspaceActionHistory(), isHydrated: true };
  const set = (partial: Partial<WorkspaceState> | ((current: WorkspaceState) => Partial<WorkspaceState>)) => {
    state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
  };
  const move = createMoveNodesAction(set, async (payload) => moveNodes(driver, payload));
  let peerState = { ...state };
  const setPeer = (partial: Partial<WorkspaceState> | ((current: WorkspaceState) => Partial<WorkspaceState>)) => {
    peerState = { ...peerState, ...(typeof partial === 'function' ? partial(peerState) : partial) };
  };
  const movePeer = createMoveNodesAction(setPeer, async (payload) => moveNodes(peer, payload));
  installWorkspaceMutationRepository({ ...createBrowserLocalWorkspaceMutationRepository(),
    syncMoveNodes: async (payload) => moveNodes(driver, payload) });
  const children = (parentId: string) => {
    const current = loadWorkspaceSnapshot(peer)!;
    return current.nodeOrder.filter((id) => current.nodesById[id]?.parentNodeId === parentId);
  };
  return { children, driver, get: () => state, getPeer: () => peerState, move, movePeer, peer, set, setPeer, file,
    close: () => { resetWorkspaceMutationRepository(); peerDatabase.close(); database.close();
      rmSync(root, { recursive: true, force: true }); } };
}

let harness: ReturnType<typeof createMoveHistoryDatabase>;
afterEach(() => harness?.close());

async function apply(entry: WorkspaceStructureMoveEntry, mode: 'redo' | 'undo') {
  const patch = await applyWorkspaceStructureHistory({ get: harness.get, entry, mode });
  expect(patch).not.toBeNull();
  harness.set(patch!);
}

it('exactly undoes and redoes a noncontiguous sibling selection with its subtrees', async () => {
  harness = createMoveHistoryDatabase();
  expect(await harness.move(['a', 'b'], 'y', 'after')).toBe(true);
  expect(harness.children('p')).toEqual(['x', 'y', 'a', 'b']);
  const entry = harness.get().appActionHistory.undoStack.at(-1) as WorkspaceStructureMoveEntry;
  await apply(entry, 'undo');
  expect(harness.children('p')).toEqual(['a', 'x', 'b', 'y']);
  const snapshot = loadWorkspaceSnapshot(harness.peer)!;
  expect(snapshot.nodesById['leaf-a']?.parentNodeId).toBe('a');
  expect(snapshot.nodesById['leaf-b']?.parentNodeId).toBe('b');
  expect(harness.get().nodeOrder.indexOf('leaf-a')).toBeLessThan(harness.get().nodeOrder.indexOf('x'));
  await apply(entry, 'redo');
  expect(harness.children('p')).toEqual(['x', 'y', 'a', 'b']);
});

it('restores each source parent when a selection from multiple parents moves together', async () => {
  harness = createMoveHistoryDatabase();
  expect(await harness.move(['a'], 'q', 'child')).toBe(true);
  expect(await harness.move(['a', 'b'], 'u', 'child')).toBe(true);
  const entry = harness.get().appActionHistory.undoStack.at(-1) as WorkspaceStructureMoveEntry;
  await apply(entry, 'undo');
  expect(harness.children('p')).toEqual(['x', 'b', 'y']);
  expect(harness.children('q')).toEqual(['a']);
  expect(harness.children('u')).toEqual(['u1', 'u2']);
  await apply(entry, 'redo');
  expect(harness.children('u')).toEqual(['u1', 'u2', 'b', 'a']);
});

it('rejects undo after a related sibling sequence changes without changing persisted facts', async () => {
  harness = createMoveHistoryDatabase();
  expect(await harness.move(['a', 'b'], 'y', 'after')).toBe(true);
  const entry = harness.get().appActionHistory.undoStack.at(-1) as WorkspaceStructureMoveEntry;
  expect(await harness.move(['x'], 'y', 'after')).toBe(true);
  const before = loadWorkspaceSnapshot(harness.peer);
  expect(isWorkspaceStructureHistoryApplicable(harness.get(), entry, 'undo')).toBe(false);
  expect(await applyWorkspaceStructureHistory({ get: harness.get, entry, mode: 'undo' })).toBeNull();
  expect(loadWorkspaceSnapshot(harness.peer)).toEqual(before);
});

it('preserves an independent instance sibling reorder in an unrelated parent through undo and redo', async () => {
  harness = createMoveHistoryDatabase();
  expect(await harness.move(['a', 'b'], 'y', 'after')).toBe(true);
  const entry = harness.get().appActionHistory.undoStack.at(-1) as WorkspaceStructureMoveEntry;
  harness.setPeer({ nodeOrder: harness.get().nodeOrder, nodesById: harness.get().nodesById });
  // Refresh the second instance before its next operation, as a received structural projection would.
  // The actual peer write still uses its independent connection and production move action.
  expect(await harness.movePeer(['u2'], 'u1', 'before')).toBe(true);
  const uOrder = harness.getPeer().nodeOrder.filter((id) => harness.getPeer().nodesById[id]?.parentNodeId === 'u');
  const current = harness.get();
  const next = [...current.nodeOrder];
  const positions = next.flatMap((id, index) => current.nodesById[id]?.parentNodeId === 'u' ? [index] : []);
  positions.forEach((position, index) => { next[position] = uOrder[index]!; });
  harness.set({ nodeOrder: next });
  expect(isWorkspaceStructureHistoryApplicable(harness.get(), entry, 'undo')).toBe(true);
  await apply(entry, 'undo');
  expect(harness.children('p')).toEqual(['a', 'x', 'b', 'y']);
  expect(harness.children('u')).toEqual(['u2', 'u1']);
  await apply(entry, 'redo');
  expect(harness.children('p')).toEqual(['x', 'y', 'a', 'b']);
  expect(harness.children('u')).toEqual(['u2', 'u1']);
  harness.setPeer({ ...loadWorkspaceSnapshot(harness.peer)!, nodesById: harness.get().nodesById });
  expect(harness.getPeer().nodeOrder).toEqual(harness.get().nodeOrder);
});

it('keeps unrelated local edits when a successful undo receipt arrives later', async () => {
  harness = createMoveHistoryDatabase();
  expect(await harness.move(['a', 'b'], 'y', 'after')).toBe(true);
  const entry = harness.get().appActionHistory.undoStack.at(-1) as WorkspaceStructureMoveEntry;
  let release!: () => void;
  installWorkspaceMutationRepository({ ...createBrowserLocalWorkspaceMutationRepository(),
    syncMoveNodes: async (payload) => {
      const result = moveNodes(harness.driver, payload);
      await new Promise<void>((resolve) => { release = resolve; });
      return result;
    } });
  const pending = applyWorkspaceStructureHistory({ get: harness.get, entry, mode: 'undo' });
  const latest = harness.get().nodesById;
  harness.set({ nodesById: { ...latest,
    u1: { ...latest.u1!, title: 'New title', content: 'Unsaved text' },
    a: { ...latest.a!, content: 'Unsaved moved folder text', updatedAt: '2026-10-28T02:05:00.000Z' }
  } });
  release();
  const patch = await pending;
  expect(patch).not.toBeNull();
  harness.set(patch!);
  expect(harness.get().nodesById.u1).toMatchObject({ title: 'New title', content: 'Unsaved text' });
  expect(harness.get().nodesById.a).toMatchObject({ content: 'Unsaved moved folder text',
    updatedAt: '2026-10-28T02:05:00.000Z' });
  expect(harness.children('p')).toEqual(['a', 'x', 'b', 'y']);
});

it('rolls back a failed cross-parent undo and keeps its entry applicable for retry', async () => {
  harness = createMoveHistoryDatabase();
  expect(await harness.move(['a', 'b'], 'q', 'child')).toBe(true);
  const entry = harness.get().appActionHistory.undoStack.at(-1) as WorkspaceStructureMoveEntry;
  const before = loadWorkspaceSnapshot(harness.peer);
  harness.driver.execute(`CREATE TRIGGER reject_move BEFORE UPDATE OF parent_id ON nodes
    WHEN NEW.id = 'b' BEGIN SELECT RAISE(ABORT, 'move_write_failed'); END`);
  await expect(applyWorkspaceStructureHistory({ get: harness.get, entry, mode: 'undo' }))
    .rejects.toThrow('move_write_failed');
  expect(loadWorkspaceSnapshot(harness.peer)).toEqual(before);
  expect(isWorkspaceStructureHistoryApplicable(harness.get(), entry, 'undo')).toBe(true);
  harness.driver.execute('DROP TRIGGER reject_move');
  await apply(entry, 'undo');
  const reopened = new Database(harness.file, { readonly: true });
  try {
    const persisted = loadWorkspaceSnapshot(createBetterSqlite3Driver(reopened))!;
    expect(persisted.nodeOrder.filter((id) => persisted.nodesById[id]?.parentNodeId === 'p'))
      .toEqual(['a', 'x', 'b', 'y']);
  } finally { reopened.close(); }
});
