import { expect, it } from 'vitest';

import { createEmptyEditorOperationHistory } from '../../features/editor/model/editorOperationHistory';
import { createEmptyWorkspaceActionHistory } from '../../store/workspaceActionHistory';

import { resolveEditorAwarePaletteHistoryOptions } from './useAppPaletteItems';

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
    }
  });

  expect(options.canUndoWorkspaceAction).toBe(true);
  expect(options.undoWorkspaceActionTitle).toBe('Undo Create Annotation');
});
