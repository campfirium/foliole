import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';

const requestAnimationFrameSpy = vi.fn<(callback: FrameRequestCallback) => number>();

beforeEach(() => {
  vi.useFakeTimers();
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
