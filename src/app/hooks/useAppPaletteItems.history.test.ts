import { beforeAll, expect, it } from 'vitest';

import { createEmptyEditorOperationHistory } from '../../features/editor/model/editorOperationHistory';
import { preloadTranslationCatalog, translate } from '../../shared/localization/translations';
import { createEmptyWorkspaceActionHistory } from '../../store/workspaceActionHistory';

import { resolveEditorAwarePaletteHistoryOptions } from './useAppPaletteItems';

const t = translate.bind(null, 'en');
const zhHans = translate.bind(null, 'zh-Hans');

beforeAll(async () => {
  await preloadTranslationCatalog('zh-Hans');
});

it('enables app undo for the current editor operation stack', () => {
  const options = resolveEditorAwarePaletteHistoryOptions({
    activeNodeId: 'node-1',
    appActionHistory: createEmptyWorkspaceActionHistory(),
    editorOperationHistory: {
      ...createEmptyEditorOperationHistory(),
      undoStack: [{
        annotations: [{ kind: 'highlight', nodeId: 'highlight-1', parentNodeId: 'node-1' }],
        nodeId: 'node-1',
        title: 'Create Annotation',
        type: 'annotation.create'
      }]
    },
    t
  });

  expect(options.canUndoWorkspaceAction).toBe(true);
  expect(options.undoWorkspaceActionTitle).toBe('Undo Create Annotation');
});

it('enables annotation redo even when focus moved away from the editor node', () => {
  const options = resolveEditorAwarePaletteHistoryOptions({
    activeNodeId: 'node-2',
    appActionHistory: createEmptyWorkspaceActionHistory(),
    editorOperationHistory: {
      ...createEmptyEditorOperationHistory(),
      redoStack: [{
        annotations: [{ kind: 'highlight', nodeId: 'highlight-1', parentNodeId: 'node-1' }],
        nodeId: 'node-1',
        title: 'Create Annotation',
        type: 'annotation.create'
      }]
    },
    t
  });

  expect(options.canRedoWorkspaceAction).toBe(true);
  expect(options.redoWorkspaceActionTitle).toBe('Redo Create Annotation');
});

it('localizes editor operation history titles', () => {
  const options = resolveEditorAwarePaletteHistoryOptions({
    activeNodeId: 'node-1',
    appActionHistory: createEmptyWorkspaceActionHistory(),
    editorOperationHistory: {
      ...createEmptyEditorOperationHistory(),
      undoStack: [{
        annotations: [{ kind: 'highlight', nodeId: 'highlight-1', parentNodeId: 'node-1' }],
        nodeId: 'node-1',
        title: 'Create Annotation',
        type: 'annotation.create'
      }]
    },
    t: zhHans
  });

  expect(options.undoWorkspaceActionTitle).toBe('撤销创建批注');
});
