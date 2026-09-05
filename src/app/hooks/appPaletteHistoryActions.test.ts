import { beforeEach, expect, it, vi } from 'vitest';

import { createPaletteHistoryActions } from './appPaletteHistoryActions';
import { registerUndoRouterContentContext, setUndoRouterOwner, setUndoRouterTarget } from './undoRouter';

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

it('routes answer undo to its registered document context', () => {
  const answerContext = { applyText: vi.fn(() => true), currentContent: 'Answer', nodeId: 'node-1::answer' };
  const unregister = registerUndoRouterContentContext(answerContext.nodeId, answerContext);
  setUndoRouterTarget('content', answerContext.nodeId);
  const { actions, ws } = createActions();

  actions.undoWorkspaceAction();

  expect(ws.undoEditorOperation).toHaveBeenCalledWith(answerContext);
  unregister();
});

it('does not fall back to body history when the selected answer context is unavailable', () => {
  setUndoRouterTarget('content', 'node-1::answer');
  const { actions, ws } = createActions();

  expect(actions.undoWorkspaceAction()).toBe(false);
  expect(ws.undoEditorOperation).not.toHaveBeenCalled();
});
