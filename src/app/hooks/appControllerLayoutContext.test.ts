import { expect, it } from 'vitest';

import { resolveEditorBindingArgs } from './appControllerLayoutContext';

it('binds the trash preview editor to the selected trash node', () => {
  expect(
    resolveEditorBindingArgs({
      activeNode: undefined,
      runtime: { isViewingTrashNode: true },
      selectedTrashNode: { id: 'trash-item-1' },
      ws: {
        activeNodeId: 'note-1',
        nodeViewById: {
          'trash-item-1': { scrollTopRatio: 0.4 }
        }
      }
    } as never)
  ).toEqual({
    editorNodeId: 'trash-item-1',
    editorNodeViewState: { scrollTopRatio: 0.4 }
  });
});
