import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useEditorContextCommands } from './useEditorContextCommands';

function createEditorAdapter(overrides: Record<string, unknown> = {}) {
  return {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => 'Welcome to Foliole'),
    getDocumentPositionAtClientPoint: vi.fn(() => 3),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getLineBlockHeight: vi.fn(() => 24),
    getScrollMetrics: vi.fn(),
    getScrollTop: vi.fn(),
    getSelection: vi.fn(() => ({ from: 3, to: 3 })),
    getSelectionRanges: vi.fn(() => []),
    onContentChange: vi.fn(),
    onScroll: vi.fn(),
    replaceRange: vi.fn(),
    replaceSelection: vi.fn(),
    revealPosition: vi.fn(),
    restoreSelection: vi.fn(),
    revealSelection: vi.fn(),
    setContent: vi.fn(),
    setDiffDecorations: vi.fn(),
    setSearchDecorations: vi.fn(),
    setScrollTop: vi.fn(),
    setSelection: vi.fn(),
    setSelectionRanges: vi.fn(),
    ...overrides
  };
}

function buildHookArgs(overrides: Record<string, unknown> = {}) {
  return {
    activeNode: { id: 'node-1', content: 'Welcome to Foliole', title: 'Welcome to Foliole' } as never,
    activeNodeId: 'node-1',
    createChildNode: vi.fn(() => 'child-note'),
    createHighlightNodeFromSelection: vi.fn(() => 'highlight-1'),
    createQANodeFromSelection: vi.fn(() => 'qa-1'),
    deleteNodePermanently: vi.fn(),
    deleteImageClozeRegion: vi.fn(),
    editorRef: { current: createEditorAdapter() },
    isTrashViewOpen: false,
    nodesById: {
      'cloze-1': {
        anchorLink: {
          id: 'anchor-1',
          kind: 'cloze',
          locator: { from: 0, originalText: 'Welcome', to: 7 }
        },
        content: '[...] to Foliole',
        id: 'cloze-1',
        parentNodeId: 'node-1',
        reveal: 'Welcome',
        title: '[...] to Foliole'
      },
      'node-1': { id: 'node-1', content: 'Welcome to Foliole', title: 'Welcome to Foliole' }
    } as never,
    onExitImmersiveMode: vi.fn(),
    onSelectNode: vi.fn(),
    updateNodeContent: vi.fn(),
    trashedNodeIds: [],
    ...overrides
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

function mockRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => undefined,
    top,
    width,
    x: left,
    y: top
  } as DOMRect;
}

function createClozeElement() {
  const editorElement = document.createElement('div');
  editorElement.className = 'cm-editor';
  const clozeElement = document.createElement('span');
  clozeElement.className = 'cm-md-cloze';
  clozeElement.getBoundingClientRect = vi.fn(() => mockRect(40, 90, 100, 22));
  editorElement.append(clozeElement);
  document.body.append(editorElement);
  return clozeElement;
}

it('opens an adjustable existing toolbar from a cloze click', () => {
  const clozeElement = createClozeElement();

  const { result } = renderHook(() => useEditorContextCommands(buildHookArgs()));

  act(() => {
    clozeElement.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      clientX: 80,
      clientY: 120
    }));
  });

  expect(result.current.contextMenu).toMatchObject({
    existingHighlight: expect.objectContaining({
      canAdjustRange: true,
      kind: 'cloze',
      nodeId: 'cloze-1',
      originalText: 'Welcome'
    }),
    mode: 'existing-highlight-toolbar',
    payload: null
  });
});
