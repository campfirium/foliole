import type { MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';

import { createToggleSelectionHighlightFromPayloadHandler } from './selectionHighlightToggle';

function createEditorRef(content: string, selection: { from: number; to: number }) {
  const editorRef = { current: null } as MutableRefObject<EditorAdapter | null>;
  const replaceRange = vi.fn();
  const setSelection = vi.fn();
  const setSelectionRanges = vi.fn();
  editorRef.current = {
    getContent: () => content,
    getSelectionRanges: () => [selection],
    replaceRange,
    setSelection,
    setSelectionRanges
  } as unknown as EditorAdapter;
  return { editorRef, replaceRange, setSelection, setSelectionRanges };
}

function createSelectionPayload() {
  return {
    anchorId: 'anchor-new',
    clozeContent: 'Before [...] After',
    entries: [{
      anchorId: 'anchor-new',
      clozeContent: 'Before [...] After',
      locator: { from: 8, originalText: 'Alpha', to: 13 },
      range: { from: 8, to: 13 },
      selectionText: 'Alpha'
    }],
    parentNodeId: 'parent-1',
    selectionText: 'Alpha'
  };
}

function createHandlerArgs(args: {
  anchorLink: { id: string; kind: 'highlight'; locator?: { from: number; originalText: string; to: number } };
  createHighlightFromPayload?: ReturnType<typeof vi.fn>;
  deleteNodePermanently?: ReturnType<typeof vi.fn>;
  editorRef: ReturnType<typeof createEditorRef>['editorRef'];
  syncActiveNodeContentFromEditor?: ReturnType<typeof vi.fn>;
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
    createHighlightFromPayload: args.createHighlightFromPayload ?? vi.fn(() => 'node-new'),
    deleteNodePermanently: args.deleteNodePermanently ?? vi.fn(),
    editorRef: args.editorRef,
    nodesById: {
      'child-1': childNode
    },
    syncActiveNodeContentFromEditor: args.syncActiveNodeContentFromEditor ?? vi.fn(),
    trashedNodeIds: []
  };
}

function runOpaqueIdRemovalCase() {
  const content = 'Before <highlight id="anchor-1">Alpha</highlight id="anchor-1"> After';
  const { editorRef, replaceRange } = createEditorRef(content, {
    from: content.indexOf('Alpha'),
    to: content.indexOf('Alpha') + 'Alpha'.length
  });

  const createHighlightFromPayload = vi.fn(() => 'node-new');
  const deleteNodePermanently = vi.fn();
  const syncActiveNodeContentFromEditor = vi.fn();
  const handler = createToggleSelectionHighlightFromPayloadHandler(createHandlerArgs({
    anchorLink: { id: 'anchor-1', kind: 'highlight' },
    createHighlightFromPayload,
    deleteNodePermanently,
    editorRef,
    syncActiveNodeContentFromEditor
  }));

  const result = handler(createSelectionPayload());

  expect(result).toBe('deleted');
  expect(replaceRange).toHaveBeenCalledWith(
    content.indexOf('<highlight'),
    content.indexOf('</highlight id="anchor-1">') + '</highlight id="anchor-1">'.length,
    'Alpha'
  );
  expect(deleteNodePermanently).toHaveBeenCalledWith('child-1');
  expect(syncActiveNodeContentFromEditor).toHaveBeenCalled();
  expect(createHighlightFromPayload).not.toHaveBeenCalled();
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

describe('selectionHighlightToggle', () => {
  it('removes an existing opaque-id highlight instead of creating a duplicate', runOpaqueIdRemovalCase);
  it('removes an existing locator-only highlight without touching parent content', runLocatorOnlyRemovalCase);
});
