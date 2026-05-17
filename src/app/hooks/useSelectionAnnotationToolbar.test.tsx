import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useEditorContextCommands } from './useEditorContextCommands';

function createEditorAdapter(overrides: Record<string, unknown> = {}) {
  return {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => 'Welcome to Foliole'),
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
      'highlight-1': {
        anchorLink: {
          id: 'anchor-1',
          kind: 'highlight',
          locator: { from: 0, originalText: 'Welcome', to: 7 }
        },
        content: 'Welcome',
        id: 'highlight-1',
        parentNodeId: 'node-1',
        title: 'Welcome'
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

function appendEditorTarget(child: HTMLElement) {
  const editorElement = document.createElement('div');
  editorElement.className = 'cm-editor';
  editorElement.append(child);
  document.body.append(editorElement);
}

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

it('opens an existing highlight toolbar from a highlight click', () => {
  const updateNodeContent = vi.fn();
  const deleteNodePermanently = vi.fn();
  const highlightElement = document.createElement('span');
  highlightElement.className = 'cm-md-highlight';
  highlightElement.getBoundingClientRect = vi.fn(() => ({
    bottom: 112,
    height: 22,
    left: 40,
    right: 140,
    top: 90,
    width: 100,
    x: 40,
    y: 90,
    toJSON: () => undefined
  }));
  appendEditorTarget(highlightElement);

  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs({ deleteNodePermanently, updateNodeContent }))
  );

  act(() => {
    highlightElement.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      clientX: 80,
      clientY: 120
    }));
  });

  expect(result.current.contextMenu).toMatchObject({
    existingHighlight: { nodeId: 'highlight-1', originalText: 'Welcome' },
    kind: 'selection',
    left: 58,
    mode: 'existing-highlight-toolbar',
    notePanelLeft: 8,
    notePanelTop: 120,
    payload: null
  });
  expect(result.current.contextMenu?.top).toBe(44);
  expect(highlightElement).toHaveClass('cm-md-highlight-active');

  act(() => result.current.handleCreateNote('Reader thought'));
  expect(updateNodeContent).toHaveBeenCalledWith('highlight-1', 'Welcome\n※ Reader thought');

  act(() => result.current.handleDeleteExistingHighlight());
  expect(deleteNodePermanently).toHaveBeenCalledWith('highlight-1');
});

it('anchors the selection toolbar primary action above the drag release point', () => {
  const selectedText = document.createTextNode('Welcome');
  const selectedSpan = document.createElement('span');
  selectedSpan.append(selectedText);
  appendEditorTarget(selectedSpan);
  const range = document.createRange();
  range.selectNodeContents(selectedText);
  Object.defineProperty(range, 'getBoundingClientRect', {
    configurable: true,
    value: () => mockRect(40, 90, 520, 22)
  });
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);

  const adapter = createEditorAdapter({
    getSelectionRanges: vi.fn(() => [{ from: 0, to: 7 }])
  });
  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs({ editorRef: { current: adapter } }))
  );

  act(() => {
    selectedSpan.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      clientX: 540,
      clientY: 112
    }));
  });

  expect(result.current.contextMenu).toMatchObject({
    kind: 'selection',
    left: 518,
    mode: 'annotation-toolbar',
    notePanelLeft: 420,
    notePanelTop: 120,
    payload: expect.objectContaining({ selectionText: 'Welcome' }),
    top: 44
  });
});

it('lets outside workspace item clicks finish without mutating editor selection', () => {
  const order: string[] = [];
  const adapter = createEditorAdapter({
    getSelectionRanges: vi.fn(() => [{ from: 2, to: 9 }]),
    setSelection: vi.fn(() => order.push('collapse'))
  });
  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs({ editorRef: { current: adapter } }))
  );
  const listItem = document.createElement('button');
  listItem.addEventListener('click', () => order.push('click'));
  document.body.append(listItem);

  act(() => {
    listItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    listItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 24, clientY: 40 }));
    listItem.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
  });

  expect(order).toEqual(['click']);
  expect(adapter.setSelection).not.toHaveBeenCalled();
  expect(result.current.contextMenu).toBeNull();
});
