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
    deleteEditorAnnotationNodes: vi.fn(),
    deleteImageClozeRegion: vi.fn(),
    editorRef: { current: createEditorAdapter() },
    flushPendingEditorDraft: vi.fn(() => false),
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

function createHighlightElement() {
  const highlightElement = document.createElement('span');
  highlightElement.className = 'cm-md-highlight';
  highlightElement.getBoundingClientRect = vi.fn(() => mockRect(40, 90, 100, 22));
  appendEditorTarget(highlightElement);
  return highlightElement;
}

it('opens an existing highlight toolbar from a highlight click', () => {
  const updateNodeContent = vi.fn();
  const deleteEditorAnnotationNodes = vi.fn();
  const onSelectNode = vi.fn();
  const highlightElement = createHighlightElement();

  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs({ deleteEditorAnnotationNodes, onSelectNode, updateNodeContent }))
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
  expect(updateNodeContent).toHaveBeenCalledWith(
    'highlight-1', 'Welcome\n※ Reader thought', { preserveTitle: true }
  );

  act(() => result.current.handleOpenExistingHighlight());
  expect(onSelectNode).toHaveBeenCalledWith('highlight-1');

  act(() => {
    highlightElement.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      clientX: 80,
      clientY: 100
    }));
  });
  act(() => result.current.handleDeleteExistingHighlight());
  expect(deleteEditorAnnotationNodes).toHaveBeenCalledWith(['highlight-1']);
});

it('opens a whole-image excerpt annotation and updates only its annotation suffix', () => {
  const imageRegion = document.createElement('div');
  imageRegion.className = 'cm-md-image-cloze-region';
  imageRegion.dataset.regionId = 'whole-image-region';
  imageRegion.dataset.regionScope = 'full-image';
  imageRegion.getBoundingClientRect = vi.fn(() => mockRect(40, 90, 100, 80));
  appendEditorTarget(imageRegion);
  const updateNodeContent = vi.fn(async () => true);
  const nodesById = {
    ...buildHookArgs().nodesById as object,
    'whole-image': {
      anchorLink: { id: 'whole-image-anchor', kind: 'highlight', locator: {
        from: 0, originalText: '![Cover](asset://cover.png)', to: 27
      } },
      content: '![Cover](asset://cover.png)\n※ First thought',
      id: 'whole-image',
      imageRegions: [{ attachmentId: 'cover', regions: [{
        height: 1, id: 'whole-image-region', width: 1, x: 0, y: 0
      }] }],
      parentNodeId: 'node-1', title: 'Cover excerpt'
    }
  } as never;
  const { result } = renderHook(() => useEditorContextCommands(buildHookArgs({ nodesById, updateNodeContent })));

  act(() => imageRegion.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, button: 0, clientX: 80, clientY: 120
  })));
  expect(result.current.contextMenu).toMatchObject({
    existingHighlight: {
      kind: 'highlight', nodeId: 'whole-image', note: 'First thought',
      originalText: '![Cover](asset://cover.png)'
    },
    mode: 'existing-highlight-toolbar'
  });

  act(() => { void result.current.handleCreateNote('   '); });
  expect(updateNodeContent).not.toHaveBeenCalled();
  act(() => { void result.current.handleCreateNote('Revised thought'); });
  expect(updateNodeContent).toHaveBeenCalledWith(
    'whole-image', '![Cover](asset://cover.png)\n※ Revised thought', { preserveTitle: true }
  );
});

it('treats an imported text excerpt as the same editable annotation target', () => {
  const highlightElement = createHighlightElement();
  const baseNodes = buildHookArgs().nodesById as unknown as Record<string, Record<string, unknown>>;
  const nodesById = {
    ...baseNodes,
    'highlight-1': {
      ...baseNodes['highlight-1'],
      anchorLink: {
        id: 'anchor-1', kind: 'highlight', locator: { from: 0, originalText: 'Welcome', to: 7 },
        origin: 'imported'
      },
      content: 'Welcome\n※ Imported thought'
    }
  } as never;
  const { result } = renderHook(() => useEditorContextCommands(buildHookArgs({ nodesById })));

  act(() => highlightElement.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, button: 0, clientX: 80, clientY: 120
  })));

  expect(result.current.contextMenu).toMatchObject({
    existingHighlight: { nodeId: 'highlight-1', note: 'Imported thought', originalText: 'Welcome' },
    mode: 'existing-highlight-toolbar'
  });
});

it('opens an existing highlight toolbar from the clicked highlight position before the cursor moves', () => {
  const highlightElement = createHighlightElement();
  const adapter = createEditorAdapter({
    getDocumentPositionAtClientPoint: vi.fn(() => 3),
    getSelection: vi.fn(() => ({ from: 15, to: 15 }))
  });

  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs({ editorRef: { current: adapter } }))
  );

  act(() => {
    highlightElement.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      clientX: 80,
      clientY: 120
    }));
  });

  expect(adapter.getDocumentPositionAtClientPoint).toHaveBeenCalledWith(80, 120);
  expect(result.current.contextMenu).toMatchObject({
    existingHighlight: expect.objectContaining({
      canAdjustRange: true,
      nodeId: 'highlight-1',
      originalText: 'Welcome'
    }),
    mode: 'existing-highlight-toolbar',
    payload: null
  });
});

it('prefers the existing highlight toolbar when a highlight click still has a selection payload', () => {
  const highlightElement = createHighlightElement();
  const adapter = createEditorAdapter({
    getDocumentPositionAtClientPoint: vi.fn(() => 3),
    getSelectionRanges: vi.fn(() => [{ from: 0, to: 7 }])
  });

  const { result } = renderHook(() =>
    useEditorContextCommands(buildHookArgs({ editorRef: { current: adapter } }))
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
    existingHighlight: expect.objectContaining({ nodeId: 'highlight-1' }),
    mode: 'existing-highlight-toolbar',
    payload: null
  });
});
