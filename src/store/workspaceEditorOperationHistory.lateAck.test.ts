import { expect, it, vi } from 'vitest';

import {
  getEditorOperationSession,
  type EditorAnnotationOperationEntry
} from '../features/editor/model/editorOperationHistory';
import {
  createAnnotationHistoryEntry,
  createTextHistoryEntry
} from '../features/editor/model/editorOperationHistory.testSupport';

import { createWorkspaceEditorOperationHistoryActions } from './workspaceEditorOperationHistory';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

function createHarness() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceEditorOperationHistoryActions(harness.setState, harness.getState);
  harness.setState(actions);
  return { actions, harness };
}

function pendingCreate(): EditorAnnotationOperationEntry {
  return {
    ...createAnnotationHistoryEntry('node-1', 'annotation.create'),
    canonical: 'pending'
  };
}

it('confirms a late creation acknowledgement without replacing newer topic history', () => {
  const { actions, harness } = createHarness();
  actions.pushEditorOperationEntry(pendingCreate());
  actions.pushEditorOperationEntry(createTextHistoryEntry({
    afterContent: '# Seed\n\nNewer text',
    beforeContent: '# Seed',
    nodeId: 'node-1'
  }));

  actions.settleEditorAnnotationCreation({
    annotationNodeIds: ['highlight-1'],
    nodeId: 'node-1',
    succeeded: true
  });

  expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').undoStack)
    .toEqual([
      expect.objectContaining({ canonical: 'confirmed', type: 'annotation.create' }),
      expect.objectContaining({ type: 'text.edit' })
    ]);
});

it('does not replay a queued pending undo through a newer text entry', async () => {
  const { actions, harness } = createHarness();
  actions.pushEditorOperationEntry(pendingCreate());
  expect(actions.undoEditorOperation()).toBe(true);
  actions.pushEditorOperationEntry(createTextHistoryEntry({
    afterContent: '# Seed\n\nNewer text',
    beforeContent: '# Seed',
    nodeId: 'node-1'
  }));

  actions.settleEditorAnnotationCreation({
    annotationNodeIds: ['highlight-1'],
    nodeId: 'node-1',
    succeeded: true
  });
  await vi.waitFor(() => expect(
    getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').undoStack.at(-1)?.type
  ).toBe('text.edit'));

  expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').redoStack).toEqual([]);
  expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').undoStack[0])
    .toMatchObject({ canonical: 'confirmed', type: 'annotation.create' });
});

it('invalidates the topic session when exact text replay fails', () => {
  const { actions, harness } = createHarness();
  actions.pushEditorOperationEntry(createTextHistoryEntry({
    afterContent: '# Seed\n\nTyped text',
    beforeContent: '# Seed',
    nodeId: 'node-1'
  }));

  expect(actions.undoEditorOperation({
    applyText: () => false,
    currentContent: '# Seed\n\nTyped text',
    nodeId: 'node-1'
  })).toBe(false);
  expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').undoStack).toEqual([]);
  expect(harness.getState().editorOperationHistory.invalidations.at(-1)).toEqual({
    nodeId: 'node-1',
    reason: 'text-replay-failed'
  });
});
