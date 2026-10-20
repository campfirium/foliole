// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';


let tempRoot = '';
const timings: Record<string, number> = {};
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'reading-move-test', libraryPath })
}));
vi.mock('../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: tempRoot, app_cache_dir: path.join(tempRoot, 'cache'),
    app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs')
  })
}));

import { closeDatabaseConnection } from '../../electron/database/connection.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { moveNodes, upsertNodeSnapshot } from '../../electron/database/nodeMutations.js';
import { loadWorkspaceSnapshot } from '../../electron/database/workspaceSnapshot.js';

import { buildSequentialReadingMaintenancePatch } from './workspaceSequentialReadingMaintenance';
import { maintenanceTree } from './workspaceSequentialReadingMaintenance.testSupport';
import { createInitialWorkspaceState, useWorkspaceStore, type WorkspaceState } from './workspaceStore';
import { createMoveNodesAction } from './workspaceStoreTreeActions';

afterEach(async () => {
  if (process.platform === 'win32' && process.env.CI) {
    await fs.mkdir('.tmp/vitest', { recursive: true });
    await fs.writeFile(`.tmp/vitest/reading-batch-move-${process.pid}.json`, JSON.stringify(timings));
  }
  closeDatabaseConnection();
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

it('persists every unlocked descendant through the production move and database reopen', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-reading-batch-move-'));
  const startedAt = performance.now();
  initializeDatabase();
  timings.initializedAtMs = performance.now() - startedAt;
  const args = maintenanceTree();
  for (const [position, node] of Object.values(args.previousNodesById).entries()) {
    upsertNodeSnapshot({
      nodeId: node.id, parentNodeId: node.parentNodeId, kind: node.kind, title: node.title,
      isTitleManual: true, content: node.content, reveal: null, anchorLink: null, position,
      reading: node.reading ?? null, sequentialReadingEnabled: node.sequentialReadingEnabled ?? null,
      createdAt: node.createdAt, updatedAt: node.updatedAt
    });
  }
  timings.seededAtMs = performance.now() - startedAt;
  const patch = buildSequentialReadingMaintenancePatch(args)!;
  moveNodes({
    nodeOrder: args.nodeOrder,
    nodes: ['moved', ...patch.changes.map((change) => change.nodeId)].map((id) => {
      const node = patch.nodesById[id]!;
      return { nodeId: id, parentNodeId: node.parentNodeId, reading: node.reading ?? null,
        sequentialReadingEnabled: node.sequentialReadingEnabled ?? null, updatedAt: args.now };
    })
  });
  timings.movedAtMs = performance.now() - startedAt;
  closeDatabaseConnection();
  initializeDatabase();
  timings.reopenedAtMs = performance.now() - startedAt;
  const snapshot = loadWorkspaceSnapshot()!;
  expect(snapshot.nodesById.moved?.parentNodeId).toBe('destination');
  for (const change of patch.changes) {
    expect(snapshot.nodesById[change.nodeId]?.reading).toEqual(change.afterReading);
  }
  expect(snapshot.nodesById.source?.sequentialReadingEnabled).toBe(true);
});

it.each(['topic', 'folder'] satisfies Array<'topic' | 'folder'>)('moves a complete subtree out of a %s source through the store action', async (sourceKind) => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-reading-store-move-'));
  initializeDatabase();
  const tree = maintenanceTree(30);
  const nodesById: WorkspaceState['nodesById'] = { ...tree.previousNodesById };
  nodesById.source = { ...nodesById.source!, kind: sourceKind,
    content: sourceKind === 'folder' ? '' : 'Source body', hasContent: sourceKind !== 'folder' };
  let state: WorkspaceState = { ...useWorkspaceStore.getState(), ...createInitialWorkspaceState(), nodesById,
    nodeOrder: tree.nodeOrder, isHydrated: true, activeNodeId: null };
  for (const [position, node] of Object.values(state.nodesById).entries()) {
    upsertNodeSnapshot({ nodeId: node.id, parentNodeId: node.parentNodeId, kind: node.kind,
      title: node.title, isTitleManual: true, content: node.content, reveal: null, anchorLink: null,
      position, reading: node.reading ?? null, sequentialReadingEnabled: node.sequentialReadingEnabled ?? null,
      createdAt: node.createdAt, updatedAt: node.updatedAt });
  }
  const move = createMoveNodesAction(partial => {
    state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
  }, async payload => moveNodes(payload));
  expect(await move(['moved'], 'destination', 'child')).toBe(true);
  closeDatabaseConnection();
  initializeDatabase();
  const persisted = loadWorkspaceSnapshot()!;
  expect(persisted.nodesById.moved?.parentNodeId).toBe('destination');
  for (let index = 0; index < 30; index += 1) {
    expect(persisted.nodesById[`reading-${index}`]?.reading).toMatchObject({ state: 'active', repetitionCount: 2 });
  }
});
