import { beforeEach, expect, it, vi } from 'vitest';

import {
  getEditorOperationSession,
  moveEditorOperationEntry,
  pushEditorOperationEntry,
  type EditorAnnotationOperationEntry
} from '../features/editor/model/editorOperationHistory';
import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';

import { startEditorAnnotationHistoryMutation } from './workspaceEditorAnnotationHistoryMutation';
import { hasWorkspaceNodeMutationRuntime, syncRestoreNodesToRuntime, syncSoftDeleteNodesToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => ({
  ...await importOriginal<typeof import('./workspaceRuntimeSync')>(),
  hasWorkspaceNodeMutationRuntime: vi.fn(() => true),
  syncNodeContentToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

const ENTRY: EditorAnnotationOperationEntry = {
  annotations: ['highlight-1', 'highlight-2'].map((nodeId, index) => ({
    anchorId: `anchor-${index + 1}`,
    kind: 'highlight' as const,
    nodeId,
    orderIndex: index + 1,
    parentNodeId: 'node-1'
  })),
  canonical: 'confirmed',
  nodeId: 'node-1',
  title: 'Create Annotation',
  type: 'annotation.create'
};

function createHarness(trashed = false) {
  const base = createWorkspaceNodeActionsFixture();
  const highlight = { ...base.nodesById['node-1']!, parentNodeId: 'node-1' };
  const history = pushEditorOperationEntry(base.editorOperationHistory, ENTRY);
  return createWorkspaceNodeActionsSetStateHarness({
    ...base,
    editorOperationHistory: trashed ? moveEditorOperationEntry(history, 'node-1', 'undo') : history,
    nodeOrder: [...base.nodeOrder, 'highlight-1', 'highlight-2'],
    nodesById: {
      ...base.nodesById,
      'highlight-1': { ...highlight, id: 'highlight-1' },
      'highlight-2': { ...highlight, id: 'highlight-2' }
    },
    trashedNodeIds: trashed ? ['highlight-1', 'highlight-2'] : []
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
});

it('does not consume a grouped annotation undo after a partial canonical delete', async () => {
  vi.mocked(syncSoftDeleteNodesToRuntime).mockResolvedValue({ deletedNodeIds: ['highlight-1'] });
  const harness = createHarness();

  expect(startEditorAnnotationHistoryMutation({ entry: ENTRY, get: harness.getState, mode: 'undo', set: harness.setState })).toBe(true);
  await vi.waitFor(() => expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').undoStack.at(-1))
    .toMatchObject({ canonical: 'confirmed', type: 'annotation.create' }));
  expect(harness.getState().trashedNodeIds).toEqual([]);
});

it('does not consume a grouped annotation redo after a partial canonical restore', async () => {
  vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue({ restoredNodeIds: ['highlight-1'], skippedConflicts: [] });
  const harness = createHarness(true);

  expect(startEditorAnnotationHistoryMutation({ entry: ENTRY, get: harness.getState, mode: 'redo', set: harness.setState })).toBe(true);
  await vi.waitFor(() => expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').redoStack.at(-1))
    .toMatchObject({ canonical: 'confirmed', type: 'annotation.create' }));
  expect(harness.getState().trashedNodeIds).toEqual(['highlight-1', 'highlight-2']);
});

it('applies a late canonical delete without replaying or replacing newer topic history', async () => {
  let resolveDelete!: (value: { deletedNodeIds: string[] }) => void;
  vi.mocked(syncSoftDeleteNodesToRuntime).mockImplementationOnce(() => new Promise((resolve) => {
    resolveDelete = resolve;
  }));
  const harness = createHarness();

  expect(startEditorAnnotationHistoryMutation({ entry: ENTRY, get: harness.getState, mode: 'undo', set: harness.setState })).toBe(true);
  harness.setState((state) => ({
    editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, createTextHistoryEntry({
      afterContent: '# Seed\n\nNewer text',
      beforeContent: '# Seed',
      nodeId: 'node-1'
    }))
  }));
  resolveDelete({ deletedNodeIds: ['highlight-1', 'highlight-2'] });

  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toEqual(['highlight-1', 'highlight-2']));
  expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1')).toMatchObject({
    redoStack: [],
    undoStack: [expect.objectContaining({ type: 'text.edit' })]
  });
});
