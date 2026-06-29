import { expect, it, vi } from 'vitest';

import { createPaletteHistoryActions } from './appPaletteHistoryActions';

it('runs editor undo before workspace undo from app commands', () => {
  const flushPendingEditorDraft = vi.fn(() => true);
  const undoEditorOperation = vi.fn(() => true);
  const undoWorkspaceAction = vi.fn(() => true);
  const actions = createPaletteHistoryActions({
    flushPendingEditorDraft,
    ws: {
      redoEditorOperation: vi.fn(() => false),
      redoWorkspaceAction: vi.fn(() => false),
      undoEditorOperation,
      undoWorkspaceAction
    }
  });

  expect(actions.undoWorkspaceAction()).toBe(true);
  expect(flushPendingEditorDraft).toHaveBeenCalledTimes(1);
  expect(undoEditorOperation).toHaveBeenCalledTimes(1);
  expect(flushPendingEditorDraft).toHaveBeenCalledBefore(undoEditorOperation);
  expect(undoWorkspaceAction).not.toHaveBeenCalled();
});

it('runs editor redo before workspace redo from app commands', () => {
  const flushPendingEditorDraft = vi.fn(() => true);
  const redoEditorOperation = vi.fn(() => true);
  const redoWorkspaceAction = vi.fn(() => true);
  const actions = createPaletteHistoryActions({
    flushPendingEditorDraft,
    ws: {
      redoEditorOperation,
      redoWorkspaceAction,
      undoEditorOperation: vi.fn(() => false),
      undoWorkspaceAction: vi.fn(() => false)
    }
  });

  expect(actions.redoWorkspaceAction()).toBe(true);
  expect(flushPendingEditorDraft).toHaveBeenCalledTimes(1);
  expect(redoEditorOperation).toHaveBeenCalledTimes(1);
  expect(flushPendingEditorDraft).toHaveBeenCalledBefore(redoEditorOperation);
  expect(redoWorkspaceAction).not.toHaveBeenCalled();
});
