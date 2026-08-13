import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createEmptyWorkspaceActionHistory } from './workspaceActionHistory';
import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import {
  createBrowserLocalWorkspaceMutationRepository,
  installWorkspaceMutationRepository,
  resetWorkspaceMutationRepository
} from './workspaceMutationRepository';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

function createHarness() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  return {
    actions: createWorkspaceNodeActions(harness.setState, harness.getState),
    harness,
    history: createWorkspaceActionHistoryActions(harness.setState, harness.getState)
  };
}

beforeEach(() => installWorkspaceMutationRepository(createBrowserLocalWorkspaceMutationRepository()));
afterEach(() => resetWorkspaceMutationRepository());

it('undoes and redoes canonical topic creation with the same entity id', async () => {
  const { actions, harness, history } = createHarness();
  const nodeId = (await actions.createRootNode('', 'topic'))!;
  const entry = harness.getState().appActionHistory.undoStack.at(-1)!;
  expect(entry).toMatchObject({ rootNodeId: nodeId, type: 'structure.create' });

  expect(history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(nodeId));
  expect(harness.getState().nodesById[nodeId]).toBeDefined();

  expect(history.redoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(nodeId));
  expect(harness.getState().nodesById[nodeId]).toBeDefined();
});

it('undoes and redoes a canonical rename without replacing another topic body', async () => {
  const { actions, harness, history } = createHarness();
  const otherBody = harness.getState().nodesById['node-1']!.content;
  await expect(actions.updateNodeTitle('node-1', 'Renamed')).resolves.toBe(true);
  const entry = harness.getState().appActionHistory.undoStack.at(-1)!;
  expect(entry).toMatchObject({ nodeId: 'node-1', type: 'structure.rename' });

  expect(history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().nodesById['node-1']?.title).toBe('Seed'));
  expect(harness.getState().nodesById['node-1']?.content).toBe(otherBody);

  expect(history.redoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().nodesById['node-1']?.title).toBe('Renamed'));
});

it('recomputes move order from target anchors and restores the original parent', async () => {
  const { actions, harness, history } = createHarness();
  const firstFolderId = (await actions.createRootNode('', 'folder'))!;
  const secondFolderId = (await actions.createRootNode('', 'folder'))!;
  harness.setState({ appActionHistory: createEmptyWorkspaceActionHistory() });

  await expect(actions.moveNodes([secondFolderId], firstFolderId, 'child')).resolves.toBe(true);
  const entry = harness.getState().appActionHistory.undoStack.at(-1)!;
  expect(entry).toMatchObject({ rootNodeIds: [secondFolderId], type: 'structure.move' });
  expect(harness.getState().nodesById[secondFolderId]?.parentNodeId).toBe(firstFolderId);

  expect(history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().nodesById[secondFolderId]?.parentNodeId).toBeNull());
  expect(history.redoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().nodesById[secondFolderId]?.parentNodeId).toBe(firstFolderId));
});

it('clears redo only when a new structural action becomes canonical', async () => {
  const { actions, harness, history } = createHarness();
  const nodeId = (await actions.createRootNode('', 'topic'))!;
  expect(history.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));

  await actions.createRootNode('', 'folder');
  expect(harness.getState().appActionHistory.redoStack).toEqual([]);
  expect(harness.getState().nodesById[nodeId]).toBeDefined();
});
