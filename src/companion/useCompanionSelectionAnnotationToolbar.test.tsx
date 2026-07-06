import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';


const requestAnimationFrameSpy = vi.fn<(callback: FrameRequestCallback) => number>();
const cancelAnimationFrameSpy = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  requestAnimationFrameSpy.mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameSpy);
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function createEditorAdapter(selection: { from: number; to: number }[], pointPosition = 7) {
  return {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => 'Welcome to Foliole'),
    getDocumentPositionAtClientPoint: vi.fn((clientX: number) => (clientX < 50 ? 0 : pointPosition)),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getLineBlockHeight: vi.fn(() => 24),
    getScrollMetrics: vi.fn(),
    getScrollTop: vi.fn(),
    getSelection: vi.fn(() => selection[0] ?? { from: 0, to: 0 }),
    getSelectionRanges: vi.fn(() => selection),
    onContentChange: vi.fn(),
    onScroll: vi.fn(),
    replaceRange: vi.fn(),
    replaceSelection: vi.fn(),
    revealPosition: vi.fn(),
    revealSelection: vi.fn(),
    restoreSelection: vi.fn(),
    setContent: vi.fn(),
    setDiffDecorations: vi.fn(),
    setSearchDecorations: vi.fn(),
    setScrollTop: vi.fn(),
    setSelection: vi.fn(),
    setSelectionRanges: vi.fn()
  };
}

function stubDomSelection(hostClassName = 'cm-content') {
  const content = document.createElement('div');
  content.className = hostClassName;
  const textNode = document.createTextNode('Welcome');
  content.append(textNode);
  document.body.append(content);
  const range = {
    getBoundingClientRect: () => ({ bottom: 30, height: 20, left: 10, right: 80, top: 10, width: 70 }),
    getClientRects: () => ({
      0: { height: 20, left: 10, right: 80, top: 10 },
      length: 1
    })
  };
  return vi.spyOn(window, 'getSelection').mockReturnValue({
    anchorNode: textNode,
    focusNode: textNode,
    getRangeAt: () => range,
    isCollapsed: false,
    rangeCount: 1,
    removeAllRanges: vi.fn(),
    toString: () => 'Welcome'
  } as unknown as Selection);
}

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'highlight-1'],
    nodesById: {
      'highlight-1': {
        anchorLink: {
          id: 'anchor-1',
          kind: 'highlight',
          locator: { from: 8, originalText: 'to', to: 10 }
        },
        content: 'to',
        createdAt: '2026-05-03T00:00:00.000Z',
        hideTitleHeading: false,
        id: 'highlight-1',
        isTitleManual: false,
        kind: 'topic',
        openingText: null,
        parentNodeId: 'node-1',
        reading: null,
        reveal: null,
        review: null,
        title: 'to',
        updatedAt: '2026-05-03T00:00:00.000Z'
      },
      'node-1': {
        anchorLink: null,
        content: 'Welcome to Foliole',
        createdAt: '2026-05-03T00:00:00.000Z',
        hideTitleHeading: false,
        id: 'node-1',
        isTitleManual: false,
        kind: 'topic',
        openingText: null,
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        title: 'Parent',
        updatedAt: '2026-05-03T00:00:00.000Z'
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

it('opens after a dragged mobile selection settles without an extra tap', () => {
  const selection: { from: number; to: number }[] = [];
  const { result } = renderHook(() =>
    useCompanionSelectionAnnotationToolbar({
      canCreateAnnotation: true,
      nodeId: 'node-1',
      snapshot: null
    })
  );

  act(() => {
    result.current.handleEditorReady(createEditorAdapter(selection) as never);
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 120 }));
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 96, clientY: 136 }));
    selection.push({ from: 0, to: 7 });
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(240);
  });

  expect(result.current.selectionToolbar?.payload?.selectionText).toBe('Welcome');
  expect(result.current.selectionToolbar).toMatchObject({
    left: expect.any(Number),
    top: expect.any(Number)
  });
});

it('opens from an Android DOM text selection when the editor selection is read-only', () => {
  const { result } = renderHook(() =>
    useCompanionSelectionAnnotationToolbar({
      canCreateAnnotation: true,
      nodeId: 'node-1',
      snapshot: null
    })
  );

  act(() => {
    stubDomSelection('markdown-editor-host');
    result.current.handleEditorReady(createEditorAdapter([]) as never);
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 120 }));
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 96, clientY: 136 }));
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(240);
  });

  expect(result.current.selectionToolbar?.payload?.selectionText).toBe('Welcome');
});

it('keeps the last Android DOM selection payload after toolbar button focus clears the selection', () => {
  const { result } = renderHook(() =>
    useCompanionSelectionAnnotationToolbar({
      canCreateAnnotation: true,
      nodeId: 'node-1',
      snapshot: null
    })
  );

  act(() => {
    const selectionSpy = stubDomSelection();
    result.current.handleEditorReady(createEditorAdapter([]) as never);
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 120 }));
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 96, clientY: 136 }));
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(240);
    selectionSpy.mockReturnValue(null);
  });

  expect(result.current.resolveSelectionPayload()?.selectionText).toBe('Welcome');
});

it('opens existing highlight actions when tapping a rendered highlight without text selection', () => {
  const selection = [{ from: 0, to: 0 }];
  const target = document.createElement('span');
  target.className = 'cm-md-highlight';
  const { result } = renderHook(() =>
    useCompanionSelectionAnnotationToolbar({
      canCreateAnnotation: true,
      nodeId: 'node-1',
      snapshot: createSnapshot()
    })
  );

  act(() => {
    result.current.handleEditorReady(createEditorAdapter(selection, 9) as never);
    result.current.openSelectionToolbar({
      clientX: 100,
      clientY: 120,
      target
    } as never);
  });

  expect(result.current.selectionToolbar?.existingHighlight).toEqual({
    nodeId: 'highlight-1',
    originalText: 'to'
  });
  expect(result.current.selectionToolbar?.payload).toBeNull();
  expect(target).toHaveClass('cm-md-highlight-active');
});

it('clears editor selection when closing after an action', () => {
  const selection = [{ from: 0, to: 7 }];
  const adapter = createEditorAdapter(selection);
  const { result } = renderHook(() =>
    useCompanionSelectionAnnotationToolbar({
      canCreateAnnotation: true,
      nodeId: 'node-1',
      snapshot: null
    })
  );

  act(() => {
    result.current.handleEditorReady(adapter as never);
    result.current.clearSelectionAndCloseToolbar();
  });

  expect(adapter.setSelection).toHaveBeenCalledWith({ from: 7, to: 7 });
});
