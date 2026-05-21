import { describe, expect, it, vi } from 'vitest';

import { createEditorChangeHandler, createNodeContentChangeHandler } from './appControllerEditorHandlers';
import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

function createNodesById() {
  return {
    'highlight-1': {
      anchorLink: { id: 'hl-1', kind: 'highlight', locator: { from: 0, originalText: 'Alpha', to: 5 } },
      content: 'Alpha',
      createdAt: '2026-05-21T00:00:00.000Z',
      id: 'highlight-1',
      kind: 'item',
      parentNodeId: 'node-1',
      reveal: null,
      review: null,
      title: 'Alpha',
      updatedAt: '2026-05-21T00:00:00.000Z'
    },
    'node-1': {
      anchorLink: null,
      content: 'Alpha Beta Gamma',
      createdAt: '2026-05-21T00:00:00.000Z',
      hasContent: true,
      id: 'node-1',
      kind: 'topic',
      parentNodeId: null,
      reveal: null,
      review: null,
      title: 'Node',
      updatedAt: '2026-05-21T00:00:00.000Z'
    }
  };
}

function createEditorOperationHistory(mode: 'after-create' | 'after-undo' = 'after-create') {
  const annotationEntry = {
    annotations: [{ kind: 'highlight', nodeId: 'highlight-1', parentNodeId: 'node-1' }],
    nodeId: 'node-1',
    title: 'Create Annotation',
    type: 'annotation.create'
  };
  return {
    redoStack: mode === 'after-undo' ? [annotationEntry] : [],
    undoStack: mode === 'after-create' ? [annotationEntry] : []
  };
}

function createArgs(mode?: 'after-create' | 'after-undo') {
  const pushEditorOperationEntry = vi.fn();
  const updateNodeContent = vi.fn();
  return {
    pushEditorOperationEntry,
    updateNodeContent,
    args: {
      runtime: { isViewingTrashNode: false },
      ws: {
        activeNodeId: 'node-1',
        editorOperationHistory: createEditorOperationHistory(mode),
        nodeOrder: ['node-1', 'highlight-1'],
        nodesById: createNodesById(),
        pushEditorOperationEntry,
        trashedNodeIds: [],
        updateNodeContent
      }
    } as unknown as BuildControllerLayoutPropsArgs
  };
}

describe('app controller editor history handlers', () => {
  it('ignores the stale blank editor change that can arrive after creating an annotation', () => {
    const { args, pushEditorOperationEntry, updateNodeContent } = createArgs();

    createEditorChangeHandler(args)('');

    expect(pushEditorOperationEntry).not.toHaveBeenCalled();
    expect(updateNodeContent).not.toHaveBeenCalled();
  });

  it('keeps annotation redo available when a stale blank editor change arrives after undoing it', () => {
    const { args, pushEditorOperationEntry, updateNodeContent } = createArgs('after-undo');

    createEditorChangeHandler(args)('');

    expect(pushEditorOperationEntry).not.toHaveBeenCalled();
    expect(updateNodeContent).not.toHaveBeenCalled();
  });

  it('keeps normal text edits after creating an annotation undoable', () => {
    const { args, pushEditorOperationEntry, updateNodeContent } = createArgs();

    createNodeContentChangeHandler(args)('node-1', 'Alpha Beta Gamma Delta');

    expect(pushEditorOperationEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        afterContent: 'Alpha Beta Gamma Delta',
        beforeContent: 'Alpha Beta Gamma',
        type: 'text.edit'
      })
    );
    expect(updateNodeContent).toHaveBeenCalledWith('node-1', 'Alpha Beta Gamma Delta');
  });
});
