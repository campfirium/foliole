import { beforeEach, expect, it, vi } from 'vitest';

import { getEditorOperationSession } from '../features/editor/model/editorOperationHistory';
import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';

import { createWorkspaceEditorOperationHistoryActions } from './workspaceEditorOperationHistory';
import {
  hasWorkspaceNodeMutationRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createHighlightLocator,
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(async () => undefined),
  syncNodeContentMutationToRuntime: vi.fn(async () => null),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null),
  syncNodeRevealMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn(async ({ nodeIds }: { nodeIds: string[] }) => ({ deletedNodeIds: nodeIds }))
}));

function createHarness() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const nodeActions = createWorkspaceNodeActions(harness.setState, harness.getState);
  const historyActions = createWorkspaceEditorOperationHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...nodeActions, ...historyActions });
  return { harness, historyActions };
}

function deferredResult<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

async function createHighlight(harness: ReturnType<typeof createHarness>['harness'], suffix: string) {
  return harness.getState().createHighlightNodeFromSelection(
    'node-1', 'Seed', `anchor-${suffix}`, createHighlightLocator(`anchor-${suffix}`, 'Seed')
  );
}

function createTextContext(harness: ReturnType<typeof createHarness>['harness']) {
  return {
    applyText: (entry: ReturnType<typeof createTextHistoryEntry>, mode: 'redo' | 'undo') => {
      const content = mode === 'undo' ? entry.beforeContent : entry.afterContent;
      void harness.getState().updateNodeContent(entry.nodeId, content, { publishLocal: false });
      return true;
    },
    currentContent: harness.getState().nodesById['node-1']!.content,
    getCurrentContent: () => harness.getState().nodesById['node-1']!.content,
    nodeId: 'node-1'
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(false);
});

it('serializes a second undo while the first annotation delete is pending', async () => {
  const { harness, historyActions } = createHarness();
  const firstId = await createHighlight(harness, '1');
  const secondId = await createHighlight(harness, '2');
  const firstDelete = deferredResult<{ deletedNodeIds: string[] }>();
  const secondDelete = deferredResult<{ deletedNodeIds: string[] }>();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncSoftDeleteNodesToRuntime)
    .mockImplementationOnce(() => firstDelete.promise)
    .mockImplementationOnce(() => secondDelete.promise);

  expect(historyActions.undoEditorOperation()).toBe(true);
  expect(historyActions.undoEditorOperation()).toBe(true);
  firstDelete.resolve({ deletedNodeIds: [secondId!] });
  await vi.waitFor(() => expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledTimes(2));
  secondDelete.resolve({ deletedNodeIds: [firstId!] });

  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toEqual(expect.arrayContaining([firstId, secondId])));
  expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').redoStack).toHaveLength(2);
});

it('serializes redo requested while annotation undo is still pending', async () => {
  const { harness, historyActions } = createHarness();
  const createdId = await createHighlight(harness, '1');
  const pendingDelete = deferredResult<{ deletedNodeIds: string[] }>();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncSoftDeleteNodesToRuntime).mockImplementationOnce(() => pendingDelete.promise);
  vi.mocked(syncRestoreNodesToRuntime).mockResolvedValueOnce({ restoredNodeIds: [createdId!], skippedConflicts: [] });

  expect(historyActions.undoEditorOperation()).toBe(true);
  expect(historyActions.redoEditorOperation()).toBe(true);
  pendingDelete.resolve({ deletedNodeIds: [createdId!] });

  await vi.waitFor(() => expect(syncRestoreNodesToRuntime).toHaveBeenCalledWith({ nodeIds: [createdId] }));
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(createdId));
  expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').undoStack).toHaveLength(1);
});

it('keeps later redo commands after an extra queued undo becomes a no-op', async () => {
  const { harness, historyActions } = createHarness();
  const createdId = await createHighlight(harness, 'noop');
  const pendingDelete = deferredResult<{ deletedNodeIds: string[] }>();
  const pendingRestore = deferredResult<{ restoredNodeIds: string[]; skippedConflicts: never[] }>();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncSoftDeleteNodesToRuntime).mockImplementationOnce(() => pendingDelete.promise);
  vi.mocked(syncRestoreNodesToRuntime).mockImplementationOnce(() => pendingRestore.promise);

  expect(historyActions.undoEditorOperation()).toBe(true);
  expect(historyActions.undoEditorOperation()).toBe(true);
  expect(historyActions.redoEditorOperation()).toBe(true);
  expect(historyActions.redoEditorOperation()).toBe(true);
  pendingDelete.resolve({ deletedNodeIds: [createdId!] });

  await vi.waitFor(() => expect(syncRestoreNodesToRuntime).toHaveBeenCalledWith({ nodeIds: [createdId] }));
  pendingRestore.resolve({ restoredNodeIds: [createdId!], skippedConflicts: [] });
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(createdId));
  expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1')).toMatchObject({
    redoStack: [],
    undoStack: [expect.objectContaining({ type: 'annotation.create' })]
  });
});

it('preserves every rapid undo and redo across annotation and text history', async () => {
  const { harness, historyActions } = createHarness();
  const afterContent = '# Seed\n\nTyped body';
  historyActions.pushEditorOperationEntry(createTextHistoryEntry({
    afterContent,
    beforeContent: '# Seed',
    nodeId: 'node-1'
  }));
  await harness.getState().updateNodeContent('node-1', afterContent);
  const createdId = await createHighlight(harness, 'mixed');
  const pendingDelete = deferredResult<{ deletedNodeIds: string[] }>();
  const pendingRestore = deferredResult<{ restoredNodeIds: string[]; skippedConflicts: never[] }>();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncSoftDeleteNodesToRuntime).mockImplementationOnce(() => pendingDelete.promise);
  vi.mocked(syncRestoreNodesToRuntime).mockImplementationOnce(() => pendingRestore.promise);
  const context = createTextContext(harness);

  expect(historyActions.undoEditorOperation(context)).toBe(true);
  expect(historyActions.undoEditorOperation(context)).toBe(true);
  expect(historyActions.redoEditorOperation(context)).toBe(true);
  expect(historyActions.redoEditorOperation(context)).toBe(true);
  pendingDelete.resolve({ deletedNodeIds: [createdId!] });

  await vi.waitFor(() => expect(syncRestoreNodesToRuntime).toHaveBeenCalledWith({ nodeIds: [createdId] }));
  pendingRestore.resolve({ restoredNodeIds: [createdId!], skippedConflicts: [] });
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(createdId));
  expect(harness.getState().nodesById['node-1']?.content).toBe(afterContent);
  expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1')).toMatchObject({
    redoStack: [],
    undoStack: [expect.objectContaining({ type: 'text.edit' }), expect.objectContaining({ type: 'annotation.create' })]
  });
  expect(harness.getState().editorOperationHistory.invalidations).toEqual([]);
});
