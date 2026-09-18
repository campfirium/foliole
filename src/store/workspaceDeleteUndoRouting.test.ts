import { beforeEach, expect, it, vi } from 'vitest';

import { createPaletteHistoryActions } from '../app/hooks/appPaletteHistoryActions';
import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import {
  hasWorkspaceNodeMutationRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';
import { getUndoRouterOwner, setUndoRouterTarget } from './workspaceUndoRouter';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncPdfImageExcerptNodeMutationToRuntime: vi.fn(),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(),
  syncNodeContentMutationToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));
vi.mock('../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: vi.fn() }));

function createHarness() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState(history);
  return {
    actions: createWorkspaceNodeActions(harness.setState, harness.getState),
    harness,
    history
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(false);
});

it.each(['topic', 'folder', 'item'] as const)('immediately undoes a %s delete after content owned undo', async (kind) => {
  const { actions, harness, history } = createHarness();
  const node = harness.getState().nodesById['node-1']!;
  harness.setState({ nodesById: { ...harness.getState().nodesById, [node.id]: { ...node, kind } } });
  vi.mocked(syncSoftDeleteNodesToRuntime).mockResolvedValue({ deletedNodeIds: [node.id] });
  vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue({ restoredNodeIds: [node.id], skippedConflicts: [] });
  const undoEditorOperation = vi.fn(() => false);
  const routed = createPaletteHistoryActions({
    getEditorOperationContext: () => undefined,
    ws: { ...history, undoEditorOperation, redoEditorOperation: () => false }
  });
  setUndoRouterTarget('content', node.id);

  await actions.deleteNode(node.id);
  expect(harness.getState().trashedNodeIds).toContain(node.id);
  expect(routed.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(node.id));
  expect(undoEditorOperation).not.toHaveBeenCalled();
  if (kind === 'item') expect(showAppRuntimeNotice).not.toHaveBeenCalled();
});

it('queues immediate routed undo while a batch deletion is being persisted', async () => {
  const { actions, harness, history } = createHarness();
  const node = harness.getState().nodesById['node-1']!;
  harness.setState({
    nodeOrder: [node.id, 'node-2'],
    nodesById: { ...harness.getState().nodesById, 'node-2': { ...node, id: 'node-2' } }
  });
  let finishDelete!: (value: { deletedNodeIds: string[] }) => void;
  vi.mocked(syncSoftDeleteNodesToRuntime).mockImplementationOnce(() => new Promise((resolve) => {
    finishDelete = resolve;
  }));
  vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue({ restoredNodeIds: [node.id, 'node-2'], skippedConflicts: [] });
  const routed = createPaletteHistoryActions({
    getEditorOperationContext: () => undefined,
    ws: { ...history, undoEditorOperation: () => false, redoEditorOperation: () => false }
  });
  setUndoRouterTarget('content', node.id);
  const deletion = actions.deleteNodes([node.id, 'node-2']);
  expect(routed.undoWorkspaceAction()).toBe(true);
  expect(harness.getState().appActionHistory.pendingAction?.undoRequested).toBe(true);
  finishDelete({ deletedNodeIds: [node.id, 'node-2'] });
  await deletion;
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
  expect(harness.getState().trashedNodeIds).toEqual([]);
});

it('keeps content ownership when a deletion request has no valid target', async () => {
  const { actions } = createHarness();
  setUndoRouterTarget('content', 'node-1');
  await actions.deleteNodes(['missing']);
  expect(getUndoRouterOwner()).toBe('content');
});

it('preserves a newer content focus when an accepted deletion finishes later', async () => {
  const { actions } = createHarness();
  let finishDelete!: (value: { deletedNodeIds: string[] }) => void;
  vi.mocked(syncSoftDeleteNodesToRuntime).mockImplementationOnce(() => new Promise((resolve) => {
    finishDelete = resolve;
  }));
  setUndoRouterTarget('content', 'node-1');
  const deletion = actions.deleteNode('node-1');
  setUndoRouterTarget('content', 'other-topic');
  finishDelete({ deletedNodeIds: ['node-1'] });
  await deletion;
  expect(getUndoRouterOwner()).toBe('content');
});
