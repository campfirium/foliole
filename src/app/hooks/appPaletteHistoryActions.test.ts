import { beforeEach, expect, it, vi } from 'vitest';

import { createPaletteHistoryActions } from './appPaletteHistoryActions';
import { setUndoRouterOwner } from './undoRouter';

const context = { applyText: vi.fn(() => true), currentContent: 'Body', nodeId: 'node-1' };

beforeEach(() => setUndoRouterOwner('workspace'));

function createActions(overrides?: {
  redoEditorOperation?: () => boolean;
  undoEditorOperation?: () => boolean;
}) {
  const flushPendingEditorDraft = vi.fn(() => true);
  const ws = {
    redoEditorOperation: vi.fn(overrides?.redoEditorOperation ?? (() => false)),
    redoWorkspaceAction: vi.fn(() => true),
    undoEditorOperation: vi.fn(overrides?.undoEditorOperation ?? (() => false)),
    undoWorkspaceAction: vi.fn(() => true)
  };
  return {
    actions: createPaletteHistoryActions({
      flushPendingEditorDraft,
      getEditorOperationContext: () => context,
      ws
    }),
    flushPendingEditorDraft,
    ws
  };
}

it('routes content undo only to the current topic history without fallback or draft flush', () => {
  setUndoRouterOwner('content');
  const { actions, flushPendingEditorDraft, ws } = createActions();

  expect(actions.undoWorkspaceAction()).toBe(false);
  expect(ws.undoEditorOperation).toHaveBeenCalledWith(context);
  expect(ws.undoWorkspaceAction).not.toHaveBeenCalled();
  expect(flushPendingEditorDraft).not.toHaveBeenCalled();
});

it('routes workspace redo only to structural history after flushing the current draft', () => {
  const { actions, flushPendingEditorDraft, ws } = createActions({ redoEditorOperation: () => true });

  expect(actions.redoWorkspaceAction()).toBe(true);
  expect(flushPendingEditorDraft).toHaveBeenCalledOnce();
  expect(ws.redoWorkspaceAction).toHaveBeenCalledOnce();
  expect(ws.redoEditorOperation).not.toHaveBeenCalled();
});
