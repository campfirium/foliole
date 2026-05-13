import type { MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { createMockEditorAdapter } from '../../test/editorAdapterTestSupport';
import type { SelectionCommandPayload } from '../contextCommands';

import { createToggleSelectionHighlightFromPayloadHandler } from './selectionHighlightToggle';

function createEditorRef(content: string, selection: { from: number; to: number }) {
  const editorRef = { current: null } as MutableRefObject<EditorAdapter | null>;
  const replaceRange = vi.fn();
  const setSelection = vi.fn();
  const setSelectionRanges = vi.fn();
  editorRef.current = createMockEditorAdapter({
    getContent: () => content,
    getSelectionRanges: () => [selection],
    replaceRange,
    setSelection,
    setSelectionRanges
  });
  return { editorRef, replaceRange, setSelection, setSelectionRanges };
}

function createHandlerArgs(args: {
  anchorLink: { id: string; kind: 'highlight'; locator?: { from: number; originalText: string; to: number } };
  createHighlightFromPayload?: (payload: SelectionCommandPayload) => string | null;
  deleteNodePermanently?: (nodeId: string) => void;
  editorRef: ReturnType<typeof createEditorRef>['editorRef'];
  syncActiveNodeContentFromEditor?: () => void;
}) {
  const childNode: Node = {
    id: 'child-1',
    parentNodeId: 'parent-1',
    kind: 'item',
    title: 'Alpha',
    content: 'Alpha',
    anchorLink: args.anchorLink,
    reveal: null,
    review: null,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  };
  return {
    activeNodeId: 'parent-1',
    createHighlightFromPayload: args.createHighlightFromPayload ?? vi.fn<(payload: SelectionCommandPayload) => string | null>(() => 'node-new'),
    deleteNodePermanently: args.deleteNodePermanently ?? vi.fn<(nodeId: string) => void>(),
    editorRef: args.editorRef,
    nodesById: {
      'child-1': childNode
    },
    syncActiveNodeContentFromEditor: args.syncActiveNodeContentFromEditor ?? vi.fn<() => void>(),
    trashedNodeIds: []
  };
}

function runLocatorOnlyRemovalCase() {
  const content = 'Before Alpha After';
  const { editorRef, replaceRange } = createEditorRef(content, { from: 7, to: 12 });

  const createHighlightFromPayload = vi.fn(() => 'node-new');
  const deleteNodePermanently = vi.fn();
  const syncActiveNodeContentFromEditor = vi.fn();
  const handler = createToggleSelectionHighlightFromPayloadHandler(createHandlerArgs({
    anchorLink: { id: 'anchor-1', kind: 'highlight', locator: { from: 7, originalText: 'Alpha', to: 12 } },
    createHighlightFromPayload,
    deleteNodePermanently,
    editorRef,
    syncActiveNodeContentFromEditor
  }));

  const result = handler({
    anchorId: 'anchor-new',
    clozeContent: 'Before [...] After',
    entries: [{
      anchorId: 'anchor-new',
      clozeContent: 'Before [...] After',
      locator: { from: 7, originalText: 'Alpha', to: 12 },
      range: { from: 7, to: 12 },
      selectionText: 'Alpha'
    }],
    parentNodeId: 'parent-1',
    selectionText: 'Alpha'
  });

  expect(result).toBe('deleted');
  expect(deleteNodePermanently).toHaveBeenCalledWith('child-1');
  expect(replaceRange).not.toHaveBeenCalled();
  expect(syncActiveNodeContentFromEditor).not.toHaveBeenCalled();
  expect(createHighlightFromPayload).not.toHaveBeenCalled();
}

function runLocatorMismatchCreatesNewHighlightCase() {
  const content = 'Before Alpha After Alpha';
  const { editorRef, replaceRange } = createEditorRef(content, { from: 19, to: 24 });

  const createHighlightFromPayload = vi.fn(() => 'node-new');
  const deleteNodePermanently = vi.fn();
  const syncActiveNodeContentFromEditor = vi.fn();
  const handler = createToggleSelectionHighlightFromPayloadHandler(createHandlerArgs({
    anchorLink: { id: 'anchor-1', kind: 'highlight', locator: { from: 7, originalText: 'Alpha', to: 12 } },
    createHighlightFromPayload,
    deleteNodePermanently,
    editorRef,
    syncActiveNodeContentFromEditor
  }));

  const result = handler({
    anchorId: 'anchor-new',
    clozeContent: 'Before Alpha After [...]',
    entries: [{
      anchorId: 'anchor-new',
      clozeContent: 'Before Alpha After [...]',
      locator: { from: 19, originalText: 'Alpha', to: 24 },
      range: { from: 19, to: 24 },
      selectionText: 'Alpha'
    }],
    parentNodeId: 'parent-1',
    selectionText: 'Alpha'
  });

  expect(result).toBe('created');
  expect(createHighlightFromPayload).toHaveBeenCalledTimes(1);
  expect(deleteNodePermanently).not.toHaveBeenCalled();
  expect(replaceRange).not.toHaveBeenCalled();
  expect(syncActiveNodeContentFromEditor).not.toHaveBeenCalled();
}

describe('selectionHighlightToggle', () => {
  it('removes an existing locator-only highlight without touching parent content', runLocatorOnlyRemovalCase);
  it('creates a new highlight when the selection matches text but not the existing locator', runLocatorMismatchCreatesNewHighlightCase);
});
