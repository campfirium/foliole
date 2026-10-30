import '../../test/ambientWorkspaceRefresh.testSupport';

import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { closeDatabaseConnection, openDatabaseConnection } from '../../../electron/database/connection.js';
import { saveReadingProgress } from '../../../electron/database/readingProgress.js';
import { handleStorageCommand } from '../../../electron/ipc/storageCommands.js';
import { readMoveParentOrder } from '../../../lib/core/database/nodeMoveStructure.js';
import { loadWorkspaceListSnapshot } from '../../../lib/core/database/workspaceListSnapshot.js';
import { nodeReadingSummary, nodeReviewSummary } from '../../../lib/core/nodes/nodeLearningSummary.js';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { invoke, origin } from '../../test/ambientWorkspaceRefresh.testSupport';

import { useWorkspaceContentChangedRefresh } from './useWorkspaceSyncAppliedRefresh';

async function mutate(command: string, args: Record<string, unknown>) {
  await act(async () => {
    await handleStorageCommand(command, args, origin as never);
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(1500);
  });
}

async function create(id: string, parentNodeId: string | null = null, kind = 'topic') {
  const now = new Date().toISOString();
  await mutate(kind === 'folder' ? 'create_folder' : 'create_topic', { nodeId: id, kind, parentNodeId,
    title: id, content: `Body ${id}`, anchorLink: null, reveal: null, position: null,
    isTitleManual: true, createdAt: now, updatedAt: now, ...(id === 'created' ? { reading: {
      state: 'active', priority: 5, repetitionCount: 2, readingPosition: 17,
      intervalDurationMs: 86400000, intervalGrowthFactor: 2, lastHandledAt: now, nextAt: '2099-01-01T00:00:00Z' } } : {}) });
}

function expectStructure() {
  const expected = loadWorkspaceListSnapshot(openDatabaseConnection().driver)!;
  const current = useWorkspaceStore.getState();
  expect(current.nodeOrder.filter(id => id !== 'special-home')).toEqual(expected.nodeOrder);
  expect(Object.keys(current.nodesById).filter(id => id !== 'special-home').sort()).toEqual(Object.keys(expected.nodesById).sort());
  expect(current.trashedNodeIds).toEqual(expected.trashedNodeIds);
  for (const [id, node] of Object.entries(expected.nodesById)) {
    const actual = current.nodesById[id];
    expect(actual).toMatchObject({ parentNodeId: node.parentNodeId, title: node.title });
    expect(nodeReadingSummary(actual)).toEqual(node.learningSummary!.reading);
    expect(nodeReviewSummary(actual)).toEqual(node.learningSummary!.review);
  }
}

it('shows creation, moves, subtree trash and restore, and permanent removal without full list hydration', async () => {
  const view = renderHook(() => useWorkspaceContentChangedRefresh());
  await act(async () => { await Promise.resolve(); });
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
  await create('folder', null, 'folder'); await create('created'); await create('child', 'created');
  expectStructure();
  const roots = readMoveParentOrder(openDatabaseConnection().driver, null).visibleIds;
  await mutate('move_nodes', { nodes: [{ nodeId: 'created', expectedParentNodeId: null,
    parentNodeId: 'folder', updatedAt: new Date().toISOString() }],
  parentOrders: [{ parentNodeId: null, expectedChildIds: roots, childIds: roots.filter(id => id !== 'created') },
    { parentNodeId: 'folder', expectedChildIds: [], childIds: ['created'] }],
  maintainSequentialReading: true, defaultPriority: 5 });
  expectStructure();
  await mutate('soft_delete_nodes', { nodeIds: ['created', 'child'], deletedAt: new Date().toISOString() });
  expectStructure();
  await mutate('restore_nodes', { nodeIds: ['created', 'child'] });
  expectStructure();
  await mutate('delete_nodes_permanently', { nodeIds: ['created', 'child'] });
  expectStructure();
  expect(useWorkspaceStore.getState().nodesById.created).toBeUndefined();
  expect(useWorkspaceStore.getState().nodesById.child).toBeUndefined();
  expect(useWorkspaceStore.getState().activeNodeId).toBe('topic');
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(0);
  view.unmount(); vi.useRealTimers(); closeDatabaseConnection();
  expect(openDatabaseConnection().driver.queryOne('SELECT id FROM nodes WHERE id = ?', ['created'])).toBeUndefined();
});

it('publishes already committed deletion chunks when a later SQLite chunk fails', async () => {
  for (const id of ['blocked', ...Array.from({ length: 10 }, (_, index) => `removed-${index}`)]) await create(id);
  const ids = ['blocked', ...Array.from({ length: 10 }, (_, index) => `removed-${index}`)];
  const view = renderHook(() => useWorkspaceContentChangedRefresh());
  await act(async () => { await Promise.resolve(); });
  invoke.mockClear();
  openDatabaseConnection().driver.execute(`CREATE TRIGGER block_last_delete BEFORE DELETE ON nodes
    WHEN OLD.id = 'blocked' BEGIN SELECT RAISE(ABORT, 'blocked delete'); END`);
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
  await act(async () => {
    await expect(handleStorageCommand('delete_nodes_permanently', { nodeIds: ids }, origin as never)).rejects.toThrow('blocked delete');
    await vi.advanceTimersByTimeAsync(1500);
  });
  expectStructure();
  expect(useWorkspaceStore.getState().nodesById.blocked).toBeDefined();
  expect(ids.slice(1).every(id => !useWorkspaceStore.getState().nodesById[id])).toBe(true);
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(0);
  view.unmount();
});


it('refreshes a parent image changed by removing a child absent from the receiver baseline', async () => {
  const now = new Date().toISOString();
  const region = (id: string) => ({ id, x: 0, y: 0, width: 0.5, height: 0.5 });
  const node = { title: 'Image parent', content: 'Original parent body', isTitleManual: true,
    reveal: null, anchorLink: null, createdAt: now, updatedAt: now, position: null };
  await mutate('create_topic', { ...node, nodeId: 'image-parent', parentNodeId: null, kind: 'topic',
    imageRegions: [{ attachmentId: 'image', regions: [region('gone'), region('keep')] }] });
  saveReadingProgress({ activeNodeId: 'image-parent', updatedAt: now, nodeViewStates: [] });
  await useWorkspaceStore.persist.rehydrate();
  useWorkspaceStore.setState({ activeNodeId: 'image-parent' });
  await mutate('create_item', { ...node, nodeId: 'unknown-child', parentNodeId: 'image-parent', kind: 'item',
    anchorLink: { id: 'gone', kind: 'cloze', locator: { attachmentId: 'image', x: 0, y: 0, width: 0.5, height: 0.5 } } });
  expect(useWorkspaceStore.getState().nodesById['unknown-child']).toBeUndefined();
  const view = renderHook(() => useWorkspaceContentChangedRefresh());
  await act(async () => { await Promise.resolve(); });
  invoke.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
  await mutate('delete_nodes_permanently', { nodeIds: ['unknown-child'] });
  expect(useWorkspaceStore.getState().nodesById['image-parent']?.imageRegions)
    .toEqual([{ attachmentId: 'image', regions: [region('keep')] }]);
  expect(useWorkspaceStore.getState().nodesById['image-parent']?.content).toBe('Original parent body');
  expect(invoke.mock.calls.filter(([name]) => name === 'load_workspace_list_snapshot')).toHaveLength(0);
  view.unmount();
});
