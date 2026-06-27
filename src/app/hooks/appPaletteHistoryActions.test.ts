import { expect, it, vi } from 'vitest';

import { createPaletteHistoryActions } from './appPaletteHistoryActions';

it('runs editor undo before workspace undo from app commands', () => {
  const undoEditorOperation = vi.fn(() => true);
  const undoWorkspaceAction = vi.fn(() => true);
  const actions = createPaletteHistoryActions({
    ws: {
      redoEditorOperation: vi.fn(() => false),
      redoWorkspaceAction: vi.fn(() => false),
      undoEditorOperation,
      undoWorkspaceAction
    }
  });

  expect(actions.undoWorkspaceAction()).toBe(true);
  expect(undoEditorOperation).toHaveBeenCalledTimes(1);
  expect(undoWorkspaceAction).not.toHaveBeenCalled();
});

it('runs editor redo before workspace redo from app commands', () => {
  const redoEditorOperation = vi.fn(() => true);
  const redoWorkspaceAction = vi.fn(() => true);
  const actions = createPaletteHistoryActions({
    ws: {
      redoEditorOperation,
      redoWorkspaceAction,
      undoEditorOperation: vi.fn(() => false),
      undoWorkspaceAction: vi.fn(() => false)
    }
  });

  expect(actions.redoWorkspaceAction()).toBe(true);
  expect(redoEditorOperation).toHaveBeenCalledTimes(1);
  expect(redoWorkspaceAction).not.toHaveBeenCalled();
});
