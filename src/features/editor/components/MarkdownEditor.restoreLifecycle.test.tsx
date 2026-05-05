import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockRestoreSelection = vi.fn();
const mockRevealSelection = vi.fn();
const mockRevealSelectionAtViewportRatio = vi.fn();
const mockSetSelection = vi.fn();
const mockSetScrollTop = vi.fn();
let currentContent = '';
let currentScrollTop = 0;
let scrollTopOffset = 0;

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
    setSelection(selection: { from: number; to: number }) { mockSetSelection(selection); }
    restoreSelection(selection: { from: number; to: number }) { mockRestoreSelection(selection); }
    revealSelection() { mockRevealSelection(); }
    revealSelectionAtViewportRatio(selection: { from: number; to: number }, ratio: number) {
      mockRevealSelectionAtViewportRatio(selection, ratio);
    }
    getScrollTop() { return currentScrollTop; }
    setScrollTop(scrollTop: number) { currentScrollTop = scrollTop + scrollTopOffset; mockSetScrollTop(scrollTop); }
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
  mockRevealSelection.mockClear();
  mockRevealSelectionAtViewportRatio.mockClear();
  mockSetSelection.mockClear();
  mockSetScrollTop.mockClear();
  currentContent = '';
  currentScrollTop = 0;
  scrollTopOffset = 0;
});

it('skips selection restore when immersive toggle suppression is active', () => {
  const longDocument = createLongDocument();
  renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onChange={vi.fn()}
      onShouldSuppressSelectionRestore={() => true}
      value={longDocument}
    />
  );

  expect(mockRestoreSelection).not.toHaveBeenCalled();
  expect(mockRevealSelection).not.toHaveBeenCalled();
});

it('releases the previous restore lock when switching to another document after the first restore completes quickly', async () => {
  const longDocument = createLongDocument();
  const onBeginApplyingReadingPosition = vi.fn();
  const onCompleteApplyingReadingPosition = vi.fn();

  const view = renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onBeginApplyingReadingPosition={onBeginApplyingReadingPosition}
      onChange={vi.fn()}
      onCompleteApplyingReadingPosition={onCompleteApplyingReadingPosition}
      value={longDocument}
    />
  );

  view.rerender(
    <MarkdownEditor
      nodeId="node-2"
      nodeViewState={{ scrollTop: 5_900, selection: { from: 51_200, to: 51_228 } }}
      onBeginApplyingReadingPosition={onBeginApplyingReadingPosition}
      onChange={vi.fn()}
      onCompleteApplyingReadingPosition={onCompleteApplyingReadingPosition}
      value={`${longDocument}\n\nLater content`}
    />
  );

  await waitFor(() => {
    expect(onCompleteApplyingReadingPosition).toHaveBeenCalledWith(
      'editor-restore-selection-settled',
      { from: 51_200, to: 51_200 }
    );
  });
  await waitFor(() => {
    expect(mockRestoreSelection).toHaveBeenLastCalledWith({ from: 51_200, to: 51_200 });
  });
  expect(onBeginApplyingReadingPosition).toHaveBeenCalledWith(
    { from: 48_000, to: 48_000 },
    'editor-restore-selection'
  );
  expect(onBeginApplyingReadingPosition).toHaveBeenCalledWith(
    { from: 51_200, to: 51_200 },
    'editor-restore-selection'
  );
});

it('applies the saved scroll position before an unmount while restore is pending', () => {
  const longDocument = createLongDocument();
  const onCompleteApplyingReadingPosition = vi.fn();
  const view = renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onChange={vi.fn()}
      onCompleteApplyingReadingPosition={onCompleteApplyingReadingPosition}
      value={longDocument}
    />
  );

  view.unmount();

  expect(mockSetScrollTop).toHaveBeenCalledWith(5_400);
  expect(onCompleteApplyingReadingPosition).toHaveBeenCalledWith('editor-restore-selection-cancelled', undefined);
});

it('does not restart the same restore request when typing before the first restore settles', () => {
  const longDocument = createLongDocument();
  const view = renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onChange={vi.fn()}
      value={longDocument}
    />
  );

  expect(mockRestoreSelection).toHaveBeenCalledTimes(1);

  view.rerender(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onChange={vi.fn()}
      value={`${longDocument}1`}
    />
  );

  expect(mockRestoreSelection).toHaveBeenCalledTimes(1);
});

it('starts a passive restore when saved node view state arrives after the node id', () => {
  const longDocument = createLongDocument();
  const onBeginApplyingReadingPosition = vi.fn();
  const view = renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      onBeginApplyingReadingPosition={onBeginApplyingReadingPosition}
      onChange={vi.fn()}
      value={longDocument}
    />
  );

  expect(onBeginApplyingReadingPosition).not.toHaveBeenCalled();

  view.rerender(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onBeginApplyingReadingPosition={onBeginApplyingReadingPosition}
      onChange={vi.fn()}
      value={longDocument}
    />
  );

  expect(onBeginApplyingReadingPosition).toHaveBeenCalledWith({ from: 48_000, to: 48_000 }, 'editor-restore-pending');
});

it('accepts a near-matching restored scroll position as settled without waiting for timeout', () => {
  vi.useFakeTimers();
  const requestAnimationFrameSpy = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  const cancelAnimationFrameSpy = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((handle: number) => window.clearTimeout(handle));
  const onCompleteApplyingReadingPosition = vi.fn();
  scrollTopOffset = 6;

  try {
    renderEditor(
      <MarkdownEditor
        nodeId="node-1"
        nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
        onChange={vi.fn()}
        onCompleteApplyingReadingPosition={onCompleteApplyingReadingPosition}
        value={createLongDocument()}
      />
    );

    expect(onCompleteApplyingReadingPosition).not.toHaveBeenCalled();
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(onCompleteApplyingReadingPosition).toHaveBeenCalledWith(
      'editor-restore-selection-settled',
      { from: 48_000, to: 48_000 }
    );
    expect(onCompleteApplyingReadingPosition).not.toHaveBeenCalledWith('editor-restore-selection-timeout');
  } finally {
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    vi.useRealTimers();
  }
});

it('prefers the provided viewport ratio over the saved scroll position during restore', async () => {
  renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onChange={vi.fn()}
      readingSelection={{ from: 48_000, to: 48_024 }}
      readingTargetViewportRatio={0.24}
      value={createLongDocument()}
    />
  );

  expect(mockRestoreSelection).not.toHaveBeenCalled();
  expect(mockSetSelection).toHaveBeenCalledWith({ from: 48_000, to: 48_000 });
  expect(mockRevealSelectionAtViewportRatio).toHaveBeenCalledWith({ from: 48_000, to: 48_000 }, 0.24);
  expect(mockSetScrollTop).not.toHaveBeenCalled();
});

it('does not replay the same settled reading restore on a rerender', async () => {
  const view = renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onChange={vi.fn()}
      readingSelection={{ from: 48_000, to: 48_024 }}
      readingTargetViewportRatio={0.24}
      value={createLongDocument()}
    />
  );

  await waitFor(() => {
    expect(mockSetSelection.mock.calls.length).toBeGreaterThan(0);
  });
  const settledSelectionCallCount = mockSetSelection.mock.calls.length;
  const settledRevealCallCount = mockRevealSelectionAtViewportRatio.mock.calls.length;

  view.rerender(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onChange={vi.fn()}
      readingSelection={{ from: 48_000, to: 48_024 }}
      readingTargetViewportRatio={0.24}
      value={createLongDocument()}
    />
  );

  expect(mockRestoreSelection).not.toHaveBeenCalled();
  expect(mockSetSelection).toHaveBeenCalledTimes(settledSelectionCallCount);
  expect(mockRevealSelectionAtViewportRatio).toHaveBeenCalledTimes(settledRevealCallCount);
});
