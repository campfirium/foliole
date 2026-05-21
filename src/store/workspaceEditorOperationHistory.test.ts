import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkspaceEditorOperationHistoryActions } from './workspaceEditorOperationHistory';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness,
  createHighlightLocator
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

function createHarness() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const nodeActions = createWorkspaceNodeActions(harness.setState);
  const historyActions = createWorkspaceEditorOperationHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...nodeActions, ...historyActions });
  return { harness, historyActions };
}

function pushTextEdit(historyActions: ReturnType<typeof createWorkspaceEditorOperationHistoryActions>) {
  historyActions.pushEditorOperationEntry({
    afterContent: '# Seed\n\nTyped body',
    beforeContent: '# Seed',
    nodeId: 'node-1',
    title: 'Edit Text',
    type: 'text.edit'
  });
}

function runCreatedHighlightUndoRedoCase() {
  const { harness, historyActions } = createHarness();
  const createdId = harness
    .getState()
    .createHighlightNodeFromSelection('node-1', 'Seed', 'anchor-1', createHighlightLocator('anchor-1', 'Seed'));

  expect(createdId).toBeTruthy();
  expect(harness.getState().editorOperationHistory.undoStack.at(-1)?.type).toBe('annotation.create');

  expect(historyActions.undoEditorOperation()).toBe(true);
  expect(harness.getState().trashedNodeIds).toContain(createdId as string);

  expect(historyActions.redoEditorOperation()).toBe(true);
  expect(harness.getState().trashedNodeIds).not.toContain(createdId as string);
  expect(harness.getState().nodesById[createdId as string]?.id).toBe(createdId);
}

function runAnnotationDeleteUndoRedoCase() {
  const { harness, historyActions } = createHarness();
  const createdId = harness
    .getState()
    .createHighlightNodeFromSelection('node-1', 'Seed', 'anchor-1', createHighlightLocator('anchor-1', 'Seed'));
  harness.getState().deleteEditorAnnotationNodes([createdId as string]);

  expect(harness.getState().editorOperationHistory.undoStack.at(-1)?.type).toBe('annotation.delete');
  expect(harness.getState().trashedNodeIds).toContain(createdId as string);

  expect(historyActions.undoEditorOperation()).toBe(true);
  expect(harness.getState().trashedNodeIds).not.toContain(createdId as string);

  expect(historyActions.redoEditorOperation()).toBe(true);
  expect(harness.getState().trashedNodeIds).toContain(createdId as string);
  expect(harness.getState().nodesById[createdId as string]?.id).toBe(createdId);
}

function runTextThenHighlightUndoOrderCase() {
  const { harness, historyActions } = createHarness();
  pushTextEdit(historyActions);
  harness.getState().updateNodeContent('node-1', '# Seed\n\nTyped body');
  const createdId = harness
    .getState()
    .createHighlightNodeFromSelection('node-1', 'Seed', 'anchor-1', createHighlightLocator('anchor-1', 'Seed'));

  expect(historyActions.undoEditorOperation()).toBe(true);
  expect(harness.getState().trashedNodeIds).toContain(createdId as string);
  expect(harness.getState().nodesById['node-1']?.content).toBe('# Seed\n\nTyped body');

  expect(historyActions.undoEditorOperation()).toBe(true);
  expect(harness.getState().nodesById['node-1']?.content).toBe('# Seed');
}

function runHighlightThenTextUndoOrderCase() {
  const { harness, historyActions } = createHarness();
  const createdId = harness
    .getState()
    .createHighlightNodeFromSelection('node-1', 'Seed', 'anchor-1', createHighlightLocator('anchor-1', 'Seed'));
  pushTextEdit(historyActions);
  harness.getState().updateNodeContent('node-1', '# Seed\n\nTyped body');

  expect(historyActions.undoEditorOperation()).toBe(true);
  expect(harness.getState().nodesById['node-1']?.content).toBe('# Seed');
  expect(harness.getState().trashedNodeIds).not.toContain(createdId as string);

  expect(historyActions.undoEditorOperation()).toBe(true);
  expect(harness.getState().trashedNodeIds).toContain(createdId as string);
}

describe('workspace editor operation history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('undoes and redoes a committed text edit through node content sync', () => {
    const { harness, historyActions } = createHarness();
    pushTextEdit(historyActions);
    harness.getState().updateNodeContent('node-1', '# Seed\n\nTyped body');

    expect(historyActions.undoEditorOperation()).toBe(true);
    expect(harness.getState().nodesById['node-1']?.content).toBe('# Seed');
    expect(harness.getState().editorOperationHistory.redoStack).toHaveLength(1);

    expect(historyActions.redoEditorOperation()).toBe(true);
    expect(harness.getState().nodesById['node-1']?.content).toBe('# Seed\n\nTyped body');
    expect(harness.getState().editorOperationHistory.undoStack).toHaveLength(1);
  });

  it('does not consume a text edit when the node content no longer matches the snapshot', () => {
    const { harness, historyActions } = createHarness();
    pushTextEdit(historyActions);
    harness.getState().updateNodeContent('node-1', '# Seed\n\nOther body');

    expect(historyActions.undoEditorOperation()).toBe(false);
    expect(harness.getState().nodesById['node-1']?.content).toBe('# Seed\n\nOther body');
    expect(harness.getState().editorOperationHistory.undoStack).toHaveLength(1);
    expect(harness.getState().editorOperationHistory.redoStack).toHaveLength(0);
  });

  it('keeps a cross-node text edit on the stack until its node is current', () => {
    const { harness, historyActions } = createHarness();
    pushTextEdit(historyActions);
    harness.setState({ activeNodeId: 'missing-node' });

    expect(historyActions.undoEditorOperation()).toBe(false);
    expect(harness.getState().editorOperationHistory.undoStack).toHaveLength(1);
  });

  it('undoes and redoes a created highlight as the same annotation node', () => {
    runCreatedHighlightUndoRedoCase();
  });

  it('undoes and redoes editor annotation deletion without using permanent delete', () => {
    runAnnotationDeleteUndoRedoCase();
  });

  it('undoes a highlight before an earlier text edit when the highlight was created last', () => {
    runTextThenHighlightUndoOrderCase();
  });

  it('undoes a text edit before an earlier highlight when the text was edited last', () => {
    runHighlightThenTextUndoOrderCase();
  });
});
