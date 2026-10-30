import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';

const requestAnimationFrameSpy = vi.fn<(callback: FrameRequestCallback) => number>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window, 'getSelection').mockReturnValue(null);
  requestAnimationFrameSpy.mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameSpy);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function createEditorAdapter(selection: { from: number; to: number }[]) {
  return {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => 'Welcome to Foliole'),
    getSelection: vi.fn(() => selection[0] ?? { from: 0, to: 0 }),
    getSelectionRanges: vi.fn(() => selection),
    setSelection: vi.fn()
  };
}

it('ignores selection changes while focus is inside the toolbar', () => {
  const selection = [{ from: 0, to: 7 }];
  const { result } = renderHook(() =>
    useCompanionSelectionAnnotationToolbar({ canCreateAnnotation: true, nodeId: 'node-1', snapshot: null })
  );

  act(() => {
    result.current.handleEditorReady(createEditorAdapter(selection) as never);
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 120 }));
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(240);
  });
  expect(result.current.selectionToolbar?.payload?.selectionText).toBe('Welcome');

  const toolbar = document.createElement('div');
  toolbar.dataset.companionSelectionToolbar = 'true';
  const input = document.createElement('textarea');
  toolbar.append(input);
  document.body.append(toolbar);
  input.focus();
  selection.splice(0, selection.length);

  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(240);
  });

  expect(result.current.selectionToolbar?.payload?.selectionText).toBe('Welcome');
  toolbar.remove();
});

it('keeps a long-press selection scheduled across an unrelated page render', () => {
  const selection = [{ from: 0, to: 7 }];
  const { result, rerender } = renderHook(() =>
    useCompanionSelectionAnnotationToolbar({ canCreateAnnotation: true, nodeId: 'node-1', snapshot: null })
  );
  act(() => {
    result.current.handleEditorReady(createEditorAdapter(selection) as never);
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 120 }));
    document.dispatchEvent(new Event('selectionchange'));
    document.dispatchEvent(new Event('pointercancel', { bubbles: true }));
    vi.advanceTimersByTime(100);
  });
  rerender();
  act(() => { vi.advanceTimersByTime(140); });
  expect(result.current.selectionToolbar?.payload?.selectionText).toBe('Welcome');
});

it.each(['node', 'editing'] as const)('cancels a pending selection toolbar when changing %s', change => {
  const { result, rerender } = renderHook((props: { nodeId: string; canCreateAnnotation: boolean }) =>
    useCompanionSelectionAnnotationToolbar({ ...props, snapshot: null }),
  { initialProps: { nodeId: 'node-1', canCreateAnnotation: true } });
  act(() => {
    result.current.handleEditorReady(createEditorAdapter([{ from: 0, to: 7 }]) as never);
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 120 }));
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(100);
  });
  rerender({ nodeId: change === 'node' ? 'node-2' : 'node-1', canCreateAnnotation: change !== 'editing' });
  act(() => { vi.advanceTimersByTime(140); });
  expect(result.current.selectionToolbar).toBeNull();
});

it('cancels a pending selection toolbar when the reading page unmounts', () => {
  const frame = requestAnimationFrameSpy.mock.calls.length;
  const { result, unmount } = renderHook(() =>
    useCompanionSelectionAnnotationToolbar({ nodeId: 'node-1', canCreateAnnotation: true, snapshot: null }));
  act(() => {
    result.current.handleEditorReady(createEditorAdapter([{ from: 0, to: 7 }]) as never);
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 120 }));
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(100);
  });
  unmount();
  act(() => { vi.advanceTimersByTime(140); });
  expect(requestAnimationFrameSpy.mock.calls).toHaveLength(frame);
});

it('keeps the native DOM selection across a render when the read-only adapter has no range', () => {
  const content = document.createElement('div');
  content.className = 'markdown-editor-host';
  const text = document.createTextNode('Welcome to Foliole');
  content.append(text);
  document.body.append(content);
  const range = { getClientRects: () => ({ length: 0 }),
    getBoundingClientRect: () => ({ left: 10, top: 10, bottom: 30, width: 70, height: 20 }) };
  vi.mocked(window.getSelection).mockReturnValue({ anchorNode: text, focusNode: text,
    rangeCount: 1, isCollapsed: false, toString: () => 'Welcome', getRangeAt: () => range } as unknown as Selection);
  const { result, rerender } = renderHook(() =>
    useCompanionSelectionAnnotationToolbar({ nodeId: 'node-1', canCreateAnnotation: true, snapshot: null }));
  act(() => {
    result.current.handleEditorReady(createEditorAdapter([]) as never);
    content.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 120 }));
    document.dispatchEvent(new Event('selectionchange'));
    content.dispatchEvent(new Event('pointercancel', { bubbles: true }));
    vi.advanceTimersByTime(100);
  });
  rerender();
  act(() => { vi.advanceTimersByTime(140); });
  expect(result.current.selectionToolbar?.payload?.selectionText).toBe('Welcome');
  content.remove();
});

it.each(['highlight', 'cloze'] as const)('keeps %s actions open when the native selection collapses', kind => {
  const { result } = renderHook(() =>
    useCompanionSelectionAnnotationToolbar({ nodeId: 'node-1', canCreateAnnotation: true, snapshot: null }));
  act(() => {
    result.current.handleEditorReady(createEditorAdapter([]) as never);
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 120 }));
    result.current.setSelectionToolbar({ left: 10, top: 20, noteLeft: 10, noteTop: 60, payload: null,
      existingHighlight: { kind, nodeId: 'annotation', originalText: 'Welcome' } });
  });
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(240);
  });
  expect(result.current.selectionToolbar?.existingHighlight).toMatchObject({ kind, nodeId: 'annotation' });
});
