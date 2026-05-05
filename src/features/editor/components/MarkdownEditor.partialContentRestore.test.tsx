import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockRestoreSelection = vi.fn();
const mockSetScrollTop = vi.fn();
let currentContent = '';
let currentScrollTop = 0;

const MIN_SCROLL_RESTORE_CONTENT_LENGTH = 2_000;

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
    setScrollTop(scrollTop: number) {
      currentScrollTop = currentContent.length >= MIN_SCROLL_RESTORE_CONTENT_LENGTH ? scrollTop : 0;
      mockSetScrollTop(scrollTop);
    }
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

function createScrollOnlyViewState() {
  return {
    scrollTop: 5_400,
    selection: { from: 0, to: 0 }
  };
}

function createMidDocumentViewState() {
  return {
    scrollTop: 5_400,
    selection: { from: 48_000, to: 48_024 }
  };
}

beforeEach(() => {
  mockRestoreSelection.mockClear();
  mockSetScrollTop.mockClear();
  currentContent = '';
  currentScrollTop = 0;
});

it('waits for a short placeholder body to expand before restoring a saved mid-document position', async () => {
  const longDocument = createLongDocument();
  const nodeViewState = createMidDocumentViewState();
  const view = renderEditor(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="Initial body" />);

  view.rerender(<MarkdownEditor nodeId="node-2" onChange={vi.fn()} value="Other node" />);
  view.rerender(
    <MarkdownEditor nodeId="node-1" nodeViewState={nodeViewState} onChange={vi.fn()} value="Preview body" />
  );

  expect(mockRestoreSelection).not.toHaveBeenCalled();
  expect(mockSetScrollTop).not.toHaveBeenCalled();

  view.rerender(<MarkdownEditor nodeId="node-1" nodeViewState={nodeViewState} onChange={vi.fn()} value={longDocument} />);

  expect(mockRestoreSelection).toHaveBeenLastCalledWith(nodeViewState.selection);
  await waitFor(() => {
    expect(mockSetScrollTop).toHaveBeenLastCalledWith(nodeViewState.scrollTop);
  });
});

it('retries a saved scroll-only restore after a short placeholder body fails to scroll', async () => {
  const longDocument = createLongDocument();
  const nodeViewState = createScrollOnlyViewState();
  const view = renderEditor(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="Initial body" />);

  view.rerender(<MarkdownEditor nodeId="node-2" onChange={vi.fn()} value="Other node" />);
  view.rerender(
    <MarkdownEditor nodeId="node-1" nodeViewState={nodeViewState} onChange={vi.fn()} value="Short preview body." />
  );

  expect(mockRestoreSelection).toHaveBeenLastCalledWith(nodeViewState.selection);
  await waitFor(() => {
    expect(mockSetScrollTop).toHaveBeenLastCalledWith(nodeViewState.scrollTop);
  });
  expect(currentScrollTop).toBe(0);

  mockRestoreSelection.mockClear();
  mockSetScrollTop.mockClear();

  view.rerender(<MarkdownEditor nodeId="node-1" nodeViewState={nodeViewState} onChange={vi.fn()} value={longDocument} />);

  await waitFor(() => {
    expect(mockSetScrollTop).toHaveBeenLastCalledWith(nodeViewState.scrollTop);
  });
  expect(currentScrollTop).toBe(nodeViewState.scrollTop);
});
