import { beforeAll, expect, it } from 'vitest';

import {
  createEmptyEditorOperationHistory,
  moveEditorOperationEntry,
  pushEditorOperationEntry
} from '../../features/editor/model/editorOperationHistory';
import { createAnnotationHistoryEntry } from '../../features/editor/model/editorOperationHistory.testSupport';
import { preloadTranslationCatalog, translate } from '../../shared/localization/translations';
import { createEmptyWorkspaceActionHistory } from '../../store/workspaceActionHistory';

import { resolveEditorAwarePaletteHistoryOptions } from './useAppPaletteItems';

const t = translate.bind(null, 'en');
const zhHans = translate.bind(null, 'zh-Hans');

beforeAll(async () => {
  await preloadTranslationCatalog('en');
  await preloadTranslationCatalog('zh-Hans');
});

it('enables content undo only for the active topic session', () => {
  const history = pushEditorOperationEntry(
    createEmptyEditorOperationHistory(),
    createAnnotationHistoryEntry('node-1', 'annotation.create')
  );
  const active = resolveEditorAwarePaletteHistoryOptions({
    activeNodeId: 'node-1',
    appActionHistory: createEmptyWorkspaceActionHistory(),
    editorOperationHistory: history,
    owner: 'content',
    t
  });
  const other = resolveEditorAwarePaletteHistoryOptions({
    activeNodeId: 'node-2',
    appActionHistory: createEmptyWorkspaceActionHistory(),
    editorOperationHistory: history,
    owner: 'content',
    t
  });

  expect(active).toMatchObject({ canUndoWorkspaceAction: true, undoWorkspaceActionTitle: 'Undo Create Annotation' });
  expect(other).toMatchObject({ canUndoWorkspaceAction: false, undoWorkspaceActionTitle: 'Undo' });
});

it('exposes redo only when the active topic owns the redo entry', () => {
  let history = pushEditorOperationEntry(
    createEmptyEditorOperationHistory(),
    createAnnotationHistoryEntry('node-1', 'annotation.create')
  );
  history = moveEditorOperationEntry(history, 'node-1', 'undo');
  const options = resolveEditorAwarePaletteHistoryOptions({
    activeNodeId: 'node-1',
    appActionHistory: createEmptyWorkspaceActionHistory(),
    editorOperationHistory: history,
    owner: 'content',
    t
  });

  expect(options).toMatchObject({ canRedoWorkspaceAction: true, redoWorkspaceActionTitle: 'Redo Create Annotation' });
});

it('keeps workspace ownership independent from content history and localizes content titles', () => {
  const history = pushEditorOperationEntry(
    createEmptyEditorOperationHistory(),
    createAnnotationHistoryEntry('node-1', 'annotation.create')
  );
  const content = resolveEditorAwarePaletteHistoryOptions({
    activeNodeId: 'node-1',
    appActionHistory: createEmptyWorkspaceActionHistory(),
    editorOperationHistory: history,
    owner: 'content',
    t: zhHans
  });
  const workspace = resolveEditorAwarePaletteHistoryOptions({
    activeNodeId: 'node-1',
    appActionHistory: createEmptyWorkspaceActionHistory(),
    editorOperationHistory: history,
    owner: 'workspace',
    t
  });
  const localizedWorkspace = resolveEditorAwarePaletteHistoryOptions({
    activeNodeId: 'node-1',
    appActionHistory: createEmptyWorkspaceActionHistory(),
    editorOperationHistory: history,
    owner: 'workspace',
    t: zhHans
  });

  expect(content.undoWorkspaceActionTitle).toBe('撤销创建批注');
  expect(workspace.canUndoWorkspaceAction).toBe(false);
  expect(localizedWorkspace.undoWorkspaceActionTitle).toBe('撤销');
  expect(localizedWorkspace.redoWorkspaceActionTitle).toBe('重做');
});

it('uses the last focused answer document for command state and titles', () => {
  const history = pushEditorOperationEntry(
    createEmptyEditorOperationHistory(),
    {
      afterContent: 'Answer after',
      afterSelection: { mainIndex: 0, ranges: [{ anchor: 6, head: 6 }] },
      beforeContent: 'Answer before',
      beforeSelection: { mainIndex: 0, ranges: [{ anchor: 0, head: 6 }] },
      forwardChanges: {} as never,
      inverseChanges: {} as never,
      nodeId: 'node-1::answer',
      timestamp: 1,
      title: 'Edit Text',
      type: 'text.edit',
      userEvent: 'delete.cut'
    }
  );
  const options = resolveEditorAwarePaletteHistoryOptions({
    activeNodeId: 'node-1',
    appActionHistory: createEmptyWorkspaceActionHistory(),
    contentDocumentId: 'node-1::answer',
    editorOperationHistory: history,
    owner: 'content',
    t
  });

  expect(options).toMatchObject({
    canUndoWorkspaceAction: true,
    undoWorkspaceActionTitle: 'Undo Edit Text'
  });
});
