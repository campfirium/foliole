import { act, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockComplete = vi.fn();
const mockIsPositionNearViewportRatio = vi.fn<(position: number, ratio: number) => boolean>(() => true);
const mockRestoreSelection = vi.fn();
const mockRevealSelectionAtViewportRatio = vi.fn();

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    constructor(...args: unknown[]) { void args; }
    destroy() {}
    focus() {}
    getContent() { return ''; }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    setContent() {}
    setDiffDecorations() {}
    setTextAnchorDecorations() {}
    setHideTitleHeading() {}
    getSelection() { return { from: 0, to: 0 }; }
    isPositionNearViewportRatio(position: number, ratio: number) { return mockIsPositionNearViewportRatio(position, ratio); }
    setParagraphMarker() {}
    setSelection() {}
    restoreSelection(selection: { from: number; to: number }) { mockRestoreSelection(selection); }
    revealSelection() {}
    revealSelectionAtViewportRatio(selection: { from: number; to: number }, ratio: number) {
      mockRevealSelectionAtViewportRatio(selection, ratio);
    }
    getScrollTop() { return 0; }
    setScrollTop() {}
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
  mockComplete.mockClear();
  mockIsPositionNearViewportRatio.mockClear();
  mockIsPositionNearViewportRatio.mockReturnValue(true);
  mockRestoreSelection.mockClear();
  mockRevealSelectionAtViewportRatio.mockClear();
});

it('does not complete a viewport-ratio restore in the same call stack', () => {
  vi.useFakeTimers();
  const requestAnimationFrameSpy = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  const cancelAnimationFrameSpy = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((handle: number) => window.clearTimeout(handle));

  try {
    renderEditor(
      <MarkdownEditor
        nodeId="node-1"
        nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
        onChange={vi.fn()}
        onCompleteApplyingReadingPosition={mockComplete}
        readingSelection={{ from: 48_000, to: 48_024 }}
        readingTargetViewportRatio={0.24}
        value={createLongDocument()}
      />
    );
    expect(mockComplete).not.toHaveBeenCalled();
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(mockComplete).toHaveBeenCalledWith('editor-restore-selection-settled', { from: 48_000, to: 48_000 });
  } finally {
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    vi.useRealTimers();
  }
});

it('does not run a second restore after a viewport-ratio restore clears its request', async () => {
  function Harness() {
    const [readingSelection, setReadingSelection] = useState<{ from: number; to: number } | null>({ from: 48_000, to: 48_024 });
    const [readingTargetViewportRatio, setReadingTargetViewportRatio] = useState<number | null>(0.24);

    return (
      <MarkdownEditor
        nodeId="node-1"
        nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
        onChange={vi.fn()}
        onCompleteApplyingReadingPosition={() => {
          setReadingSelection(null);
          setReadingTargetViewportRatio(null);
        }}
        onSetReadingPositionSelection={() => undefined}
        readingSelection={readingSelection}
        readingTargetViewportRatio={readingTargetViewportRatio}
        value={createLongDocument()}
      />
    );
  }

  renderEditor(<Harness />);
  await waitFor(() => {
    expect(mockRevealSelectionAtViewportRatio).toHaveBeenCalledTimes(1);
  });
  expect(mockRestoreSelection).not.toHaveBeenCalled();
});

it('reruns the same viewport-ratio request when a fresh request object arrives', async () => {
  vi.useFakeTimers();
  const requestAnimationFrameSpy = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  const cancelAnimationFrameSpy = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((handle: number) => window.clearTimeout(handle));

  function Harness() {
    const [readingSelection, setReadingSelection] = useState({ from: 48_000, to: 48_024 });

    return (
      <>
        <button onClick={() => setReadingSelection({ from: 48_000, to: 48_024 })} type="button">
          Repeat request
        </button>
        <MarkdownEditor
          nodeId="node-1"
          nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
          onChange={vi.fn()}
          readingSelection={readingSelection}
          readingTargetViewportRatio={0.24}
          value={createLongDocument()}
        />
      </>
    );
  }

  try {
    const view = renderEditor(<Harness />);
    expect(mockRevealSelectionAtViewportRatio).toHaveBeenCalledTimes(1);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    act(() => {
      view.getByRole('button', { name: 'Repeat request' }).click();
    });

    expect(mockRevealSelectionAtViewportRatio).toHaveBeenCalledTimes(2);
  } finally {
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    vi.useRealTimers();
  }
});
