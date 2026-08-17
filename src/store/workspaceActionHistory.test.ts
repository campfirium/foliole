import { beforeEach, expect, it, vi } from 'vitest';

import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import {
  hasWorkspaceNodeMutationRuntime,
  syncCreateNodeMutationToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
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

it('moves the delete cursor only after exact restore and delete confirmations', async () => {
  const { actions, harness, history } = createHarness();
  const node = harness.getState().nodesById['node-1']!;
  harness.setState({
    nodesById: { ...harness.getState().nodesById, unrelated: { ...node, id: 'unrelated' } },
    trashedNodeDeletedAtById: { unrelated: '2026-03-05T00:00:00.000Z' },
    trashedNodeIds: ['unrelated']
  });
  vi.mocked(syncSoftDeleteNodesToRuntime).mockImplementation(async ({ nodeIds }) => ({ deletedNodeIds: nodeIds }));
  vi.mocked(syncRestoreNodesToRuntime).mockImplementation(async ({ nodeIds }) => ({
    restoredNodeIds: nodeIds,
    skippedConflicts: []
  }));

  await actions.deleteNode('node-1');
  const entry = harness.getState().appActionHistory.undoStack[0];
  expect(entry).toMatchObject({ nodeIds: ['node-1'], title: 'Delete Topic', type: 'workspace.delete' });

  expect(history.undoWorkspaceAction(entry?.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain('node-1'));
  expect(harness.getState().appActionHistory.redoStack[0]?.id).toBe(entry?.id);

  expect(history.redoWorkspaceAction(entry?.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain('node-1'));
  expect(harness.getState().appActionHistory.undoStack[0]?.id).toBe(entry?.id);
  expect(harness.getState()).toMatchObject({
    trashedNodeDeletedAtById: { unrelated: '2026-03-05T00:00:00.000Z' },
    trashedNodeIds: expect.arrayContaining(['unrelated'])
  });
});

it('keeps an already-trashed descendant untouched across parent delete Undo and Redo', async () => {
  const { actions, harness, history } = createHarness();
  const parent = harness.getState().nodesById['node-1']!;
  const child = { ...parent, id: 'child-1', kind: 'item' as const, parentNodeId: 'node-1' };
  const childDeletedAt = '2026-03-05T00:00:00.000Z';
  harness.setState({
    nodeOrder: [...harness.getState().nodeOrder, child.id],
    nodesById: { ...harness.getState().nodesById, [child.id]: child },
    trashedNodeDeletedAtById: { [child.id]: childDeletedAt },
    trashedNodeIds: [child.id]
  });
  vi.mocked(syncSoftDeleteNodesToRuntime).mockImplementation(async ({ nodeIds }) => ({ deletedNodeIds: nodeIds }));
  vi.mocked(syncRestoreNodesToRuntime).mockImplementation(async ({ nodeIds }) => ({
    restoredNodeIds: nodeIds,
    skippedConflicts: []
  }));

  await actions.deleteNode(parent.id);
  const entry = harness.getState().appActionHistory.undoStack.at(-1)!;
  expect(entry).toMatchObject({ nodeIds: [parent.id], type: 'workspace.delete' });
  expect(harness.getState().trashedNodeDeletedAtById[child.id]).toBe(childDeletedAt);

  expect(history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(parent.id));
  expect(harness.getState().trashedNodeIds).toContain(child.id);
  expect(harness.getState().trashedNodeDeletedAtById[child.id]).toBe(childDeletedAt);

  expect(history.redoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(parent.id));
  expect(harness.getState().trashedNodeIds).toContain(child.id);
  expect(harness.getState().trashedNodeDeletedAtById[child.id]).toBe(childDeletedAt);
});

it('clears workspace history without changing selection when restore is partial or conflicted', async () => {
  const { actions, harness, history } = createHarness();
  vi.mocked(syncSoftDeleteNodesToRuntime).mockResolvedValue({ deletedNodeIds: ['node-1'] });
  await actions.deleteNode('node-1');
  const entry = harness.getState().appActionHistory.undoStack[0]!;
  const activeNodeId = harness.getState().activeNodeId;
  vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue({
    restoredNodeIds: [],
    skippedConflicts: [{ liveNodeId: 'other', trashNodeId: 'node-1' }]
  });

  expect(history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.applying).toBeNull());
  expect(harness.getState().appActionHistory.undoStack).toEqual([]);
  expect(harness.getState().appActionHistory.redoStack).toEqual([]);
  expect(harness.getState().activeNodeId).toBe(activeNodeId);
  expect(harness.getState().trashedNodeIds).toContain('node-1');
});

it('binds the delete notice to the same exact workspace undo entry', async () => {
  const { actions, harness } = createHarness();
  vi.mocked(syncSoftDeleteNodesToRuntime).mockResolvedValue({ deletedNodeIds: ['node-1'] });
  vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue({ restoredNodeIds: ['node-1'], skippedConflicts: [] });
  await actions.deleteNode('node-1');
  const entryId = harness.getState().appActionHistory.undoStack[0]?.id;
  const noticeCall = vi.mocked(showAppRuntimeNotice).mock.calls.at(-1);
  const noticeAction = noticeCall?.[2];

  expect(noticeCall).toMatchObject([
    'Topic moved to Trash',
    'success',
    { label: 'Undo' },
    {
      durationMs: 8000,
      presentation: 'trash-row'
    }
  ]);

  noticeAction?.onSelect();
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain('node-1'));
  expect(harness.getState().appActionHistory.redoStack[0]?.id).toBe(entryId);
  noticeAction?.onSelect();
  expect(syncRestoreNodesToRuntime).toHaveBeenCalledOnce();
});

it('records a workspace-origin Item delete without adding a dedicated notice', async () => {
  const { actions, harness, history } = createHarness();
  const node = harness.getState().nodesById['node-1']!;
  harness.setState({ nodesById: { ...harness.getState().nodesById, 'node-1': { ...node, kind: 'item' } } });
  vi.mocked(syncSoftDeleteNodesToRuntime).mockResolvedValue({ deletedNodeIds: ['node-1'] });
  vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue({ restoredNodeIds: ['node-1'], skippedConflicts: [] });

  await actions.deleteNode('node-1');
  expect(harness.getState().appActionHistory.undoStack.at(-1)).toMatchObject({
    kind: 'item',
    title: 'Delete Item',
    type: 'workspace.delete'
  });
  expect(showAppRuntimeNotice).not.toHaveBeenCalled();
  expect(history.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain('node-1'));
});

it('queues undo behind a pending canonical create without reaching older history', async () => {
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  let finishCreate!: (value: Awaited<ReturnType<typeof syncCreateNodeMutationToRuntime>>) => void;
  vi.mocked(syncCreateNodeMutationToRuntime).mockImplementationOnce(() => new Promise((resolve) => {
    finishCreate = resolve;
  }));
  vi.mocked(syncSoftDeleteNodesToRuntime).mockImplementation(async ({ nodeIds }) => ({ deletedNodeIds: nodeIds }));
  const { actions, harness, history } = createHarness();
  const createPromise = actions.createRootNode('', 'topic');
  const pending = harness.getState().appActionHistory.pendingCreate!;

  expect(history.undoWorkspaceAction()).toBe(true);
  expect(harness.getState().appActionHistory.pendingCreate?.undoRequested).toBe(true);
  finishCreate({
    createdNodeIds: [pending.entry.rootNodeId],
    nodeOrder: harness.getState().nodeOrder,
    nodes: []
  });
  await expect(createPromise).resolves.toBe(pending.entry.rootNodeId);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(pending.entry.rootNodeId));
  expect(harness.getState().appActionHistory.redoStack[0]?.id).toBe(pending.entry.id);
});
