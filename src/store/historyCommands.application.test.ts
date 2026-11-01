import { beforeAll, expect, it, vi } from 'vitest';

import { createEmptyEditorOperationHistory, pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import { createAnnotationHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';
import { preloadTranslationCatalog, translate } from '../shared/localization/translations';

import { createHistoryCommands, getHistoryCommandState } from './historyCommands';
import { createEmptyWorkspaceActionHistory } from './workspaceActionHistoryState';
import { projectApplicationEditorHistory } from './workspaceApplicationEditorHistory';
import { createApplicationHistory } from './workspaceApplicationHistory';
import { projectApplicationWorkspaceHistory } from './workspaceApplicationWorkspaceHistory';
import { setUndoRouterTarget } from './workspaceUndoRouter';

beforeAll(() => preloadTranslationCatalog('en'));
const t = translate.bind(null, 'en');

it.each(['workspace', 'content'] as const)('offers and executes the same latest action from %s focus', owner => {
  const editor = pushEditorOperationEntry(projectApplicationEditorHistory(createEmptyEditorOperationHistory(), createApplicationHistory()),
    createAnnotationHistoryEntry('parent', 'annotation.create'));
  const appActionHistory = projectApplicationWorkspaceHistory(createEmptyWorkspaceActionHistory(), editor.application!);
  const undoApplicationOperation = vi.fn(() => true);
  const undoEditorOperation = vi.fn(() => false);
  const undoWorkspaceAction = vi.fn(() => false);
  const flushPendingEditorDraft = vi.fn(() => true);
  const commands = createHistoryCommands({ flushPendingEditorDraft, getEditorOperationContext: () => undefined,
    ws: { appActionHistory, undoApplicationOperation, redoApplicationOperation: () => false,
      undoEditorOperation, undoWorkspaceAction, redoEditorOperation: () => false, redoWorkspaceAction: () => false } });
  setUndoRouterTarget(owner, owner === 'content' ? 'child' : null);
  const target = owner === 'workspace' ? { owner } : { owner, documentId: 'child' };
  expect(getHistoryCommandState({ appActionHistory, editorOperationHistory: editor, target, mode: 'undo', t }))
    .toEqual({ enabled: true, title: 'Undo Create Annotation' });
  expect(commands.undo()).toBe(true);
  expect(undoApplicationOperation).toHaveBeenCalledOnce();
  expect(flushPendingEditorDraft).toHaveBeenCalledOnce();
  expect(undoEditorOperation).not.toHaveBeenCalled();
  expect(undoWorkspaceAction).not.toHaveBeenCalled();
});
