import { describe, expect, it, vi } from 'vitest';

import {
  createEmptyEditorOperationHistory,
  moveEditorOperationEntry,
  pushEditorOperationEntry
} from '../../features/editor/model/editorOperationHistory';
import { createAnnotationHistoryEntry } from '../../features/editor/model/editorOperationHistory.testSupport';
import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';

import {
  createEditorChangeHandler,
  createEditorOperationApplyContext,
  createNodeContentChangeHandler
} from './appControllerEditorHandlers';
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
  let history = pushEditorOperationEntry(
    createEmptyEditorOperationHistory(),
    createAnnotationHistoryEntry('node-1', 'annotation.create')
  );
  if (mode === 'after-undo') history = moveEditorOperationEntry(history, 'node-1', 'undo');
  return history;
}

function createArgs(mode?: 'after-create' | 'after-undo') {
  const pushEditorOperationEntry = vi.fn();
  const updateNodeContent = vi.fn();
  const createChildNode = vi.fn();
  return {
    createChildNode,
    pushEditorOperationEntry,
    updateNodeContent,
    args: {
      runtime: { isViewingTrashNode: false },
      ws: {
        activeNodeId: 'node-1',
        createChildNode,
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

    createNodeContentChangeHandler(args)('node-1', '');

    expect(pushEditorOperationEntry).not.toHaveBeenCalled();
    expect(updateNodeContent).not.toHaveBeenCalled();
  });

  it('keeps annotation redo available when a stale blank editor change arrives after undoing it', () => {
    const { args, pushEditorOperationEntry, updateNodeContent } = createArgs('after-undo');

    createNodeContentChangeHandler(args)('node-1', '');

    expect(pushEditorOperationEntry).not.toHaveBeenCalled();
    expect(updateNodeContent).not.toHaveBeenCalled();
  });

  it('does not write normal body edits through the raw active-node fallback', () => {
    const { args, createChildNode, pushEditorOperationEntry, updateNodeContent } = createArgs();

    createEditorChangeHandler(args)('Alpha Beta Gamma Delta');

    expect(pushEditorOperationEntry).not.toHaveBeenCalled();
    expect(updateNodeContent).not.toHaveBeenCalled();
    expect(createChildNode).not.toHaveBeenCalled();
  });

  it('keeps raw no-node editor input as an Inbox creation fallback', () => {
    const { args, createChildNode } = createArgs();
    args.ws.activeNodeId = null;

    createEditorChangeHandler(args)('New inbox body');

    expect(createChildNode).toHaveBeenCalledWith(INBOX_NODE_ID, 'New inbox body');
  });

  it('saves normal text edits without synthesizing snapshot history at the draft boundary', () => {
    const { args, pushEditorOperationEntry, updateNodeContent } = createArgs();

    createNodeContentChangeHandler(args)('node-1', 'Alpha Beta Gamma Delta');

    expect(pushEditorOperationEntry).not.toHaveBeenCalled();
    expect(updateNodeContent).toHaveBeenCalledWith('node-1', 'Alpha Beta Gamma Delta', undefined);
  });

  it('allows a history replay to save an intentional empty body', () => {
    const { args, updateNodeContent } = createArgs();

    createNodeContentChangeHandler(args)('node-1', '', { historyReplay: true, publishLocal: true });

    expect(updateNodeContent).toHaveBeenCalledWith('node-1', '', { publishLocal: true });
  });

  it('matches text history against the current editor document instead of the stale store body', () => {
    const { args } = createArgs();
    const applyTextHistory = vi.fn(() => true);
    let editorContent = 'Current unsaved editor body';
    args.runtime.editorRef = {
      current: { applyTextHistory, getContent: () => editorContent }
    } as unknown as BuildControllerLayoutPropsArgs['runtime']['editorRef'];

    const context = createEditorOperationApplyContext(args);

    expect(context).toMatchObject({
      currentContent: 'Current unsaved editor body',
      nodeId: 'node-1'
    });
    editorContent = 'Newer queued body';
    expect(context?.getCurrentContent?.()).toBe('Newer queued body');
    expect(context?.applyText({} as never, 'undo')).toBe(true);
    expect(applyTextHistory).toHaveBeenCalledWith({}, 'undo');
  });

});
