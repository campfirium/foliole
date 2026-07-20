import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useEditorContextCommands } from './useEditorContextCommands';

function mockRect(left: number, top: number, width: number, height: number): DOMRect {
  return { bottom: top + height, height, left, right: left + width, top, width, x: left, y: top, toJSON: () => undefined } as DOMRect;
}

function appendPdfTargets(nodeIds = ['pdf-highlight', 'pdf-highlight']) {
  const surface = document.createElement('div');
  surface.dataset.testid = 'pdf-document-surface';
  const text = document.createElement('span');
  text.textContent = 'Selected PDF text';
  surface.appendChild(text);
  for (const nodeId of nodeIds) {
    const overlay = document.createElement('span');
    overlay.dataset.pdfHighlightNodeId = nodeId;
    overlay.getBoundingClientRect = vi.fn(() => mockRect(40, 90, 100, 22));
    surface.appendChild(overlay);
  }
  document.body.appendChild(surface);
  return { overlays: Array.from(surface.querySelectorAll<HTMLElement>('[data-pdf-highlight-node-id]')), text };
}

function buildHookArgs(overrides: Record<string, unknown> = {}) {
  const adapter = {
    getDocumentPositionAtClientPoint: vi.fn(),
    getSelection: vi.fn(() => ({ from: 0, to: 0 })),
    getSelectionRanges: vi.fn(() => [])
  };
  return {
    activeNode: { id: 'pdf', content: '', title: 'PDF' } as never,
    activeNodeId: 'pdf',
    createChildNode: vi.fn(),
    createHighlightNodeFromSelection: vi.fn(),
    createQANodeFromSelection: vi.fn(),
    deleteEditorAnnotationNodes: vi.fn(),
    deleteImageClozeRegion: vi.fn(),
    editorRef: { current: adapter as never },
    flushPendingEditorDraft: vi.fn(() => false),
    isTrashViewOpen: false,
    nodesById: {
      pdf: { id: 'pdf', content: '', title: 'PDF' },
      'pdf-highlight': {
        anchorLink: { id: 'pdf-anchor', kind: 'highlight', locator: { page: 1, x: 0.3, y: 0.4 } },
        content: 'Selected PDF text\n※ First thought',
        id: 'pdf-highlight',
        parentNodeId: 'pdf',
        title: 'Selected PDF text'
      }
    } as never,
    onExitImmersiveMode: vi.fn(),
    onSelectNode: vi.fn(),
    trashedNodeIds: [],
    updateNodeContent: vi.fn(),
    ...overrides
  };
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

it('opens PDF highlight actions without making the overlay the pointer target', () => {
  const deleteEditorAnnotationNodes = vi.fn();
  const onSelectNode = vi.fn();
  const updateNodeContent = vi.fn();
  const { text } = appendPdfTargets();
  const { result } = renderHook(() => useEditorContextCommands(buildHookArgs({ deleteEditorAnnotationNodes, onSelectNode, updateNodeContent })));

  act(() => text.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 80, clientY: 100 })));
  expect(result.current.contextMenu).toMatchObject({
    existingHighlight: { canAdjustRange: false, nodeId: 'pdf-highlight', originalText: 'Selected PDF text' },
    mode: 'existing-highlight-toolbar',
    payload: null
  });

  act(() => result.current.handleCreateNote('Revised thought'));
  expect(updateNodeContent).toHaveBeenCalledWith('pdf-highlight', 'Selected PDF text\n※ Revised thought');
  act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
  expect(result.current.contextMenu).toBeNull();

  act(() => text.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 80, clientY: 100 })));
  act(() => result.current.handleOpenExistingHighlight());
  expect(onSelectNode).toHaveBeenCalledWith('pdf-highlight');

  act(() => text.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 80, clientY: 100 })));
  act(() => result.current.handleDeleteExistingHighlight());
  expect(deleteEditorAnnotationNodes).toHaveBeenCalledWith(['pdf-highlight']);
});

it('refuses ambiguous overlapping PDF highlights', () => {
  const { text } = appendPdfTargets(['pdf-highlight', 'other-highlight']);
  const nodesById = {
    ...buildHookArgs().nodesById as object,
    'other-highlight': {
      anchorLink: { id: 'other-anchor', kind: 'highlight', locator: { page: 1, x: 0.3, y: 0.4 } },
      content: 'Other', id: 'other-highlight', parentNodeId: 'pdf', title: 'Other'
    }
  } as never;
  const { result } = renderHook(() => useEditorContextCommands(buildHookArgs({ nodesById })));

  act(() => text.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 80, clientY: 100 })));
  expect(result.current.contextMenu).toBeNull();
});

it('keeps a new PDF text selection ahead of existing-highlight hit testing', () => {
  const { text } = appendPdfTargets();
  const range = document.createRange();
  range.selectNodeContents(text);
  window.getSelection()?.addRange(range);
  const { result } = renderHook(() => useEditorContextCommands(buildHookArgs()));

  act(() => text.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 80, clientY: 100 })));
  expect(result.current.contextMenu).toBeNull();
});

it('does not open actions for a trashed PDF highlight', () => {
  const { text } = appendPdfTargets();
  const { result } = renderHook(() => useEditorContextCommands(buildHookArgs({ trashedNodeIds: ['pdf-highlight'] })));

  act(() => text.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 80, clientY: 100 })));
  expect(result.current.contextMenu).toBeNull();
});

it('opens PDF highlight actions from the keyboard target', () => {
  const { overlays } = appendPdfTargets();
  const target = overlays[0] as HTMLElement;
  const { result } = renderHook(() => useEditorContextCommands(buildHookArgs()));

  act(() => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
  expect(result.current.contextMenu).toMatchObject({
    existingHighlight: { nodeId: 'pdf-highlight' },
    mode: 'existing-highlight-toolbar'
  });
});
