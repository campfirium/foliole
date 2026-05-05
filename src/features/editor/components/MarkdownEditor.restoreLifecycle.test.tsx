import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockRestoreSelection = vi.fn();
const mockRevealSelection = vi.fn();
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
    setHideTitleHeading() {}
    getSelection() { return { from: 0, to: 0 }; }
    setParagraphMarker() {}
    setSelection() {}
    restoreSelection(selection: { from: number; to: number }) { mockRestoreSelection(selection); }
    revealSelection() { mockRevealSelection(); }
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
  mockRevealSelection.mockClear();
  mockSetScrollTop.mockClear();
  currentContent = '';
  currentScrollTop = 0;
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

it('releases the previous restore lock before starting a new restore cycle', async () => {
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
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_900, selection: { from: 51_200, to: 51_228 } }}
      onBeginApplyingReadingPosition={onBeginApplyingReadingPosition}
      onChange={vi.fn()}
      onCompleteApplyingReadingPosition={onCompleteApplyingReadingPosition}
      value={`${longDocument}\n\nLater content`}
    />
  );

  expect(onCompleteApplyingReadingPosition).toHaveBeenCalledWith('editor-restore-selection-cancelled');
  await waitFor(() => {
    expect(onBeginApplyingReadingPosition).toHaveBeenLastCalledWith(
      { from: 51_200, to: 51_228 },
      'editor-restore-selection'
    );
  });
});

it('applies the saved scroll position before an unmount can cancel the restore cycle', () => {
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
  expect(onCompleteApplyingReadingPosition).toHaveBeenCalledWith('editor-restore-selection-cancelled');
});
