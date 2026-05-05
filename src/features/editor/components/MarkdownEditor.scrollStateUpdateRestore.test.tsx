import { act, render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockRestoreSelection = vi.fn();
const mockSetScrollTop = vi.fn();
let currentContent = '';
let currentScrollTop = 0;

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    constructor(_host: HTMLElement, options?: { initialContent?: string }) {
      currentContent = options?.initialContent ?? '';
      currentScrollTop = 0;
    }
    destroy() {}
    focus() {}
    getContent() { return currentContent; }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    setContent(content: string) { currentContent = content; }
    setDiffDecorations() {}
    setTextAnchorDecorations() {}
    setHideTitleHeading() {}
    getSelection() { return { from: 0, to: 0 }; }
    setParagraphMarker() {}
    setSelection() {}
    restoreSelection(selection: { from: number; to: number }) { mockRestoreSelection(selection); }
    revealSelection() {}
    getScrollTop() { return currentScrollTop; }
    setScrollTop(scrollTop: number) { currentScrollTop = scrollTop; mockSetScrollTop(scrollTop); }
    getScrollMetrics() { return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 }; }
    replaceRange() {}
    replaceSelection() {}
    onContentChange() { return () => undefined; }
    onScroll() { return () => undefined; }
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderEditor(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
  });
}

function createLongDocument() {
  return Array.from({ length: 2_500 }, (_, index) => `Paragraph ${index}: ${'Long document body. '.repeat(4)}`).join('\n\n');
}

beforeEach(() => {
  mockRestoreSelection.mockClear();
  mockSetScrollTop.mockClear();
  currentContent = '';
  currentScrollTop = 0;
});

it('does not consume same-node scroll persistence updates as restore targets', () => {
  vi.useFakeTimers();
  const requestAnimationFrameSpy = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  const cancelAnimationFrameSpy = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((handle: number) => window.clearTimeout(handle));

  try {
    const view = renderEditor(
      <MarkdownEditor
        nodeId="node-1"
        nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
        onChange={vi.fn()}
        value={createLongDocument()}
      />
    );
    act(() => {
      vi.runOnlyPendingTimers();
    });
    mockRestoreSelection.mockClear();
    mockSetScrollTop.mockClear();
    currentScrollTop = 5_480;

    view.rerender(
      <MarkdownEditor
        nodeId="node-1"
        nodeViewState={{ scrollTop: 5_424, selection: { from: 48_240, to: 48_240 } }}
        onChange={vi.fn()}
        value={createLongDocument()}
      />
    );
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(mockRestoreSelection).not.toHaveBeenCalled();
    expect(mockSetScrollTop).not.toHaveBeenCalled();
    expect(currentScrollTop).toBe(5_480);
  } finally {
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    vi.useRealTimers();
  }
});
