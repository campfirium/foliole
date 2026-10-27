// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import { saveLocalCurrentParentOrder } from '../../lib/core/database/currentParentOrderStore.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { moveNodes } from '../../lib/core/database/nodeMoveMutations.js';
import type { NodeReadingPayload } from '../../lib/core/database/nodeReadingPayload.js';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { loadWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot.js';

import { createEmptyWorkspaceActionHistory } from './workspaceActionHistory';
import { buildMoveRuntimePayload } from './workspaceMoveCommit';
import { createBrowserLocalWorkspaceMutationRepository, installWorkspaceMutationRepository,
  resetWorkspaceMutationRepository } from './workspaceMutationRepository';
import { createInitialWorkspaceState, useWorkspaceStore, type WorkspaceState } from './workspaceStore';
import { createMoveNodesAction } from './workspaceStoreTreeActions';
import { applyWorkspaceStructureHistory } from './workspaceStructureHistoryApply';
import type { WorkspaceStructureMoveEntry } from './workspaceStructureHistoryTypes';

const now = '2026-10-28T02:00:00.000Z';
const roots: string[] = [];
const databases: Database.Database[] = [];

afterEach(() => {
  resetWorkspaceMutationRepository();
  databases.splice(0).forEach((database) => database.close());
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'foliole-local-move-'));
  roots.push(root);
  const file = path.join(root, 'library.db');
  const database = new Database(file);
  databases.push(database);
  initializeDatabaseSchema(database);
  const driver = createBetterSqlite3Driver(database);
  driver.execute("INSERT INTO settings VALUES ('host_name', ?, ?)", ['"local-move"', now]);
  bindParentOrderWriter(driver, { deviceAnchor: 'local-move', libraryPath: file });
  for (const [id, parent] of [['p', null], ['b', null], ['one', 'p'], ['two', 'p'],
    ['b1', 'b'], ['b2', 'b']] as const) {
    driver.execute(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
      VALUES (?, ?, 'folder', ?, '', ?, ?)`, [id, parent, id, now, now]);
  }
  const order = (parentId: string, childIds: string[]) => saveLocalCurrentParentOrder(driver,
    { parentId, childIds, now, hostName: 'local-move' });
  order('p', ['one', 'two']);
  order('b', ['b1', 'b2']);
  const snapshot = loadWorkspaceSnapshot(driver)!;
  const peerDatabase = new Database(file);
  databases.push(peerDatabase);
  const peer = createBetterSqlite3Driver(peerDatabase);
  let state: WorkspaceState = { ...useWorkspaceStore.getState(), ...createInitialWorkspaceState(),
    ...snapshot, nodesById: Object.fromEntries(Object.entries(snapshot.nodesById).map(([id, node]) =>
      [id, { ...node, anchorLink: null }])), appActionHistory: createEmptyWorkspaceActionHistory(), isHydrated: true };
  const set = (partial: Partial<WorkspaceState> | ((current: WorkspaceState) => Partial<WorkspaceState>)) => {
    state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
  };
  const move = createMoveNodesAction(set, async (payload) => moveNodes(driver, payload));
  installWorkspaceMutationRepository({ ...createBrowserLocalWorkspaceMutationRepository(),
    syncMoveNodes: async (payload) => moveNodes(driver, payload) });
  const children = (parentId: string) => JSON.parse(driver.queryOne<{ child_ids_json: string }>(
    'SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?', [parentId])!.child_ids_json);
  return { children, driver, get: () => state, move, peer, set };
}

function reading(state: NodeReadingPayload['state']): NodeReadingPayload {
  return { state, intervalDurationMs: 1234, intervalGrowthFactor: 1.5, lastHandledAt: now, nextAt: now,
    priority: 5, readingPosition: 31, repetitionCount: 7 };
}

function enableReadingSource(harness: ReturnType<typeof setup>) {
  harness.driver.execute("UPDATE nodes SET sequential_reading_enabled = 1 WHERE id = 'p'");
  harness.driver.execute("UPDATE nodes SET kind = 'topic', content = 'Saved text' WHERE id IN ('one', 'two')");
  for (const [nodeId, state] of [['one', 'active'], ['two', 'locked']] as const) {
    saveNodeReadingStateWithSync(harness.driver, { nodeId, reading: reading(state), hostName: 'local-move', updatedAt: now });
  }
  const snapshot = loadWorkspaceSnapshot(harness.driver, { includeBody: true })!;
  harness.set({ nodeOrder: snapshot.nodeOrder, nodesById: Object.fromEntries(Object.entries(snapshot.nodesById)
    .map(([id, node]) => [id, { ...node, anchorLink: null }])) });
}

it('keeps another parent order committed by an independent instance before a sibling move', async () => {
  const harness = setup();
  saveLocalCurrentParentOrder(harness.peer, {
    parentId: 'b', childIds: ['b2', 'b1'], now, hostName: 'peer'
  });
  expect(await harness.move(['two'], 'one', 'before')).toBe(true);
  expect(harness.children('p')).toEqual(['two', 'one']);
  expect(harness.children('b')).toEqual(['b2', 'b1']);
  const persisted = loadWorkspaceSnapshot(harness.peer)!;
  expect(persisted.nodeOrder.indexOf('b2')).toBeLessThan(persisted.nodeOrder.indexOf('b1'));
  expect(harness.get().appActionHistory.undoStack.at(-1)?.type).toBe('structure.move');
});

it('keeps reading saved by another instance when undoing and redoing a sibling move', async () => {
  const harness = setup();
  expect(await harness.move(['two'], 'one', 'before')).toBe(true);
  const entry = harness.get().appActionHistory.undoStack.at(-1) as WorkspaceStructureMoveEntry;
  harness.peer.execute(`INSERT INTO node_reading (node_id, interval_duration_ms, interval_growth_factor,
    last_handled_at, next_at, priority, repetition_count, state) VALUES ('two', 1234, 1.5, ?, ?, 5, 7, 'active')`,
  [now, now]);
  harness.peer.execute(`INSERT INTO node_reading_host_state VALUES ('two', 'local-move', 91, ?)`, [now]);
  const before = loadWorkspaceSnapshot(harness.peer)!.nodesById.two!.reading;
  for (const mode of ['undo', 'redo'] as const) {
    const patch = await applyWorkspaceStructureHistory({ get: harness.get, entry, mode });
    expect(patch).not.toBeNull();
    harness.set(patch!);
    expect(harness.children('p')).toEqual(mode === 'undo' ? ['one', 'two'] : ['two', 'one']);
    expect(loadWorkspaceSnapshot(harness.peer)!.nodesById.two!.reading).toEqual(before);
  }
});

it('releases the next sequential topic from current facts and preserves its progress and sync fact', async () => {
  const harness = setup();
  enableReadingSource(harness);
  expect(await harness.move(['one'], 'b', 'child')).toBe(true);
  expect(harness.children('p')).toEqual(['two']);
  expect(loadWorkspaceSnapshot(harness.peer)!.nodesById.two!.reading).toEqual(reading('active'));
  expect(harness.get().nodesById.two!.reading).toEqual(reading('active'));
  expect(harness.peer.queryOne<{ sync_dirty: number }>(
    "SELECT sync_dirty FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'two'")?.sync_dirty).toBe(1);
});

it.each(['active', 'done'] as const)('keeps a peer %s reading update while maintaining the moved source', async (state) => {
  const harness = setup();
  enableReadingSource(harness);
  const profile = { ...reading(state), readingPosition: 99, repetitionCount: 11 };
  saveNodeReadingStateWithSync(harness.peer, { nodeId: 'two', reading: profile, hostName: 'local-move', updatedAt: now });
  expect(await harness.move(['one'], 'b', 'child')).toBe(true);
  expect(loadWorkspaceSnapshot(harness.peer)!.nodesById.two!.reading).toEqual(profile);
  expect(harness.get().nodesById.two!.reading).toEqual(profile);
});

it('rejects a related parent race before changing membership or learning', async () => {
  const harness = setup();
  enableReadingSource(harness);
  const move = createMoveNodesAction(harness.set, async (payload) => {
    saveLocalCurrentParentOrder(harness.peer, { parentId: 'p', childIds: ['two', 'one'], now, hostName: 'peer' });
    return moveNodes(harness.driver, payload);
  });
  await expect(move(['one'], 'b', 'child')).rejects.toThrow('move_structure_conflict');
  expect(harness.children('p')).toEqual(['two', 'one']);
  expect(harness.children('b')).toEqual(['b1', 'b2']);
  expect(loadWorkspaceSnapshot(harness.peer)!.nodesById.two!.reading).toEqual(reading('locked'));
  expect(harness.get().appActionHistory.undoStack).toEqual([]);
});

it('rolls back structure and parent order when required sequential reading cannot be saved', async () => {
  const harness = setup();
  enableReadingSource(harness);
  const before = loadWorkspaceSnapshot(harness.peer);
  harness.driver.execute(`CREATE TRIGGER fail_reading BEFORE UPDATE ON node_reading
    WHEN NEW.node_id = 'two' BEGIN SELECT RAISE(ABORT, 'reading_write_failed'); END`);
  await expect(harness.move(['one'], 'b', 'child')).rejects.toThrow('reading_write_failed');
  expect(loadWorkspaceSnapshot(harness.peer)).toEqual(before);
  expect(harness.get().appActionHistory.undoStack).toEqual([]);
});

it('preserves a hidden tombstone slot during sibling reorder and subsequent undo', async () => {
  const harness = setup();
  harness.peer.execute(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at, deleted_at)
    VALUES ('hidden', 'p', 'folder', 'Hidden', '', ?, ?, ?)`, [now, now, now]);
  saveLocalCurrentParentOrder(harness.peer, { parentId: 'p', childIds: ['one', 'hidden', 'two'], now, hostName: 'peer' });
  expect(await harness.move(['two'], 'one', 'before')).toBe(true);
  const physical = () => JSON.parse(harness.peer.queryOne<{ child_ids_json: string }>(
    "SELECT child_ids_json FROM parent_child_order WHERE parent_id = 'p'")!.child_ids_json);
  expect(physical()).toEqual(['two', 'hidden', 'one']);
  const entry = harness.get().appActionHistory.undoStack.at(-1) as WorkspaceStructureMoveEntry;
  harness.set((await applyWorkspaceStructureHistory({ get: harness.get, entry, mode: 'undo' }))!);
  expect(physical()).toEqual(['one', 'hidden', 'two']);
});

it('returns the parent order actually persisted rather than the input arrays', () => {
  const harness = setup();
  const before = harness.get();
  const patch = { nodesById: before.nodesById, nodeOrder: before.nodeOrder.map((id) =>
    id === 'one' ? 'two' : id === 'two' ? 'one' : id) };
  const payload = buildMoveRuntimePayload(before, patch, ['two'], false);
  const result = moveNodes(harness.driver, payload);
  expect(result.parentOrders).not.toBe(payload.parentOrders);
  expect(result.parentOrders).toEqual([{ parentNodeId: 'p', childIds: harness.children('p') }]);
  expect(result.nodes[0]?.updatedAt).toBe(before.nodesById.two!.updatedAt);
  expect(result.readings).toEqual([]);
});

it('keeps move transport and returned query rows independent of unrelated library size', async () => {
  const measurements: Array<{ size: number; rows: number; requestChars: number; replyChars: number }> = [];
  for (const size of [100, 1000, 10000]) {
    const harness = setup();
    harness.driver.transaction(() => {
      for (let index = 0; index < size; index += 1) harness.driver.execute(
        `INSERT INTO nodes (id, kind, title, content, created_at, updated_at) VALUES (?, 'folder', 'Unrelated', '', ?, ?)`,
        [`unrelated-${index}`, now, now]);
    });
    let rows = 0;
    const driver: DatabaseDriver = { ...harness.driver,
      queryAll: ((sql, params) => {
        const result = harness.driver.queryAll(sql, params);
        rows += result.length;
        return result;
      }) as DatabaseDriver['queryAll'],
      transaction: (execute) => harness.driver.transaction(() => execute(driver)) };
    const move = createMoveNodesAction(harness.set, async (payload) => {
      const reply = moveNodes(driver, payload);
      measurements.push({ size, rows, requestChars: JSON.stringify(payload).length, replyChars: JSON.stringify(reply).length });
      return reply;
    });
    expect(await move(['two'], 'one', 'before')).toBe(true);
    expect(harness.children('p')).toEqual(['two', 'one']);
  }
  expect(new Set(measurements.map((entry) => entry.rows)).size).toBe(1);
  expect(new Set(measurements.map((entry) => entry.requestChars)).size).toBe(1);
  expect(new Set(measurements.map((entry) => entry.replyChars)).size).toBe(1);
  mkdirSync('.tmp/artifacts/T542', { recursive: true });
  writeFileSync('.tmp/artifacts/T542/move-scope-measurements.json', JSON.stringify(measurements, null, 2));
});

it('moves physical roots without persisting or removing injected navigation entries', async () => {
  const harness = setup();
  const navigation = createInitialWorkspaceState();
  harness.set({ nodeOrder: [...navigation.nodeOrder, ...harness.get().nodeOrder],
    nodesById: { ...navigation.nodesById, ...harness.get().nodesById } });
  expect(await harness.move(['p'], 'b', 'child')).toBe(true);
  expect(harness.children('b')).toEqual(['b1', 'b2', 'p']);
  expect(harness.get().nodeOrder).toEqual(expect.arrayContaining(navigation.nodeOrder));
  expect(harness.peer.queryOne("SELECT id FROM nodes WHERE id = 'special-home'")).toBeUndefined();
});

it('uses the current source manual order rather than the renderer snapshot when releasing a topic', async () => {
  const harness = setup();
  harness.driver.execute(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('three', 'p', 'topic', 'Three', 'Saved text', ?, ?)`, [now, now]);
  saveLocalCurrentParentOrder(harness.driver, { parentId: 'p', childIds: ['one', 'two', 'three'], now, hostName: 'local-move' });
  saveNodeReadingStateWithSync(harness.driver, { nodeId: 'three', reading: reading('locked'), hostName: 'local-move', updatedAt: now });
  enableReadingSource(harness);
  harness.peer.execute("UPDATE nodes SET manual_child_order = ? WHERE id = 'p'", [JSON.stringify(['one', 'three', 'two'])]);
  expect(await harness.move(['one'], 'b', 'child')).toBe(true);
  const persisted = loadWorkspaceSnapshot(harness.peer)!;
  expect(persisted.nodesById.three?.reading).toEqual(reading('active'));
  expect(persisted.nodesById.two?.reading).toEqual(reading('locked'));
  expect(harness.get().nodesById.three?.reading).toEqual(reading('active'));
});

it('honors a source disabled by another instance without overwriting its flag or locked sibling', async () => {
  const harness = setup();
  enableReadingSource(harness);
  harness.peer.execute("UPDATE nodes SET sequential_reading_enabled = 0 WHERE id = 'p'");
  expect(await harness.move(['one'], 'b', 'child')).toBe(true);
  const persisted = loadWorkspaceSnapshot(harness.peer)!;
  expect(persisted.nodesById.p?.sequentialReadingEnabled).toBe(false);
  expect(persisted.nodesById.two?.reading).toEqual(reading('locked'));
});
