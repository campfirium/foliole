import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockMarkNodePositionRequested = vi.fn();
const mockMarkNodePositionReady = vi.fn();
const mockDestroy = vi.fn();
const mockSetContent = vi.fn();
const mockSetDiffDecorations = vi.fn();
const mockSetSearchDecorations = vi.fn();
const mockSetHideTitleHeading = vi.fn();
const mockSetSelection = vi.fn();
const mockRevealSelection = vi.fn();
const mockRestoreSelection = vi.fn();
const mockSetScrollTop = vi.fn();
const mockOnScroll = vi.fn(() => () => undefined);
let currentScrollTop = 0;

vi.mock('../../../shared/platform/performanceDiagnosticsProbe', () => ({
  markEditorContentSyncCompleted: vi.fn(),
  markEditorContentSyncStarted: vi.fn(),
  markNodePositionReady: (...args: unknown[]) => mockMarkNodePositionReady(...args),
  markNodePositionRequested: (...args: unknown[]) => mockMarkNodePositionRequested(...args)
}));

function createMockCodeMirrorEditorAdapterClass() {
  return class {
    destroy() {
      mockDestroy();
    }
    focus() {}
    getContent() { return ''; }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    setContent(content: string) {
      mockSetContent(content);
    }
    setDiffDecorations(diffDecorations: unknown) {
      mockSetDiffDecorations(diffDecorations);
    }
    setSearchDecorations(searchDecorations: unknown) {
      mockSetSearchDecorations(searchDecorations);
    }
    setTextAnchorDecorations() {}
    setHideTitleHeading(value: boolean) {
      mockSetHideTitleHeading(value);
    }
    getSelection() {
      return { from: 0, to: 0 };
    }
    setParagraphMarker() {}
    setSelection(selection: { from: number; to: number }) {
      mockSetSelection(selection);
    }
    restoreSelection(selection: { from: number; to: number }) {
      mockRestoreSelection(selection);
    }
    revealSelection(selection: { from: number; to: number }) {
      mockRevealSelection(selection);
    }
    getScrollTop() {
      return currentScrollTop;
    }
    setScrollTop(scrollTop: number) {
      currentScrollTop = scrollTop;
      mockSetScrollTop(scrollTop);
    }
    getScrollMetrics() {
      return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 };
    }
    replaceRange() {}
    replaceSelection() {}
    onContentChange() {
      return () => undefined;
    }
    onScroll() {
      return mockOnScroll();
    }
  };
}

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: createMockCodeMirrorEditorAdapterClass()
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderEditor(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
  });
}

async function expectRestoredViewState(nodeViewState: { scrollTop: number; selection: { from: number; to: number } }) {
  expect(mockRestoreSelection).toHaveBeenLastCalledWith({
    from: nodeViewState.selection.from,
    to: nodeViewState.selection.from
  });
  if (nodeViewState.selection.from !== nodeViewState.selection.to || nodeViewState.selection.from !== 0) {
    expect(mockSetSelection).toHaveBeenLastCalledWith({
      from: nodeViewState.selection.from,
      to: nodeViewState.selection.from
    });
  } else {
    expect(mockSetSelection).not.toHaveBeenCalled();
  }
  await waitFor(() => {
    expect(mockSetScrollTop).toHaveBeenLastCalledWith(nodeViewState.scrollTop);
  });
  expect(mockRevealSelection).not.toHaveBeenCalled();
}

function createLongDocument() {
  return Array.from({ length: 2_500 }, (_, index) => `Paragraph ${index}: ${'Long document body. '.repeat(4)}`).join('\n\n');
}

beforeEach(() => {
  mockMarkNodePositionRequested.mockClear();
  mockMarkNodePositionReady.mockClear();
  mockDestroy.mockClear();
  mockSetContent.mockClear();
  mockSetDiffDecorations.mockClear();
  mockSetSearchDecorations.mockClear();
  mockSetHideTitleHeading.mockClear();
  mockSetSelection.mockClear();
  mockRevealSelection.mockClear();
  mockRestoreSelection.mockClear();
  mockSetScrollTop.mockClear();
  mockOnScroll.mockClear();
  currentScrollTop = 0;
});

it('restores mid-document selection and scroll when reopening a long document', async () => {
  const longDocument = createLongDocument();
  const nodeViewState = {
    scrollTop: 5_400,
    selection: { from: 48_000, to: 48_024 }
  };
  const view = renderEditor(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value={longDocument} />);

  expect(mockSetSelection).not.toHaveBeenCalled();
  expect(mockRevealSelection).not.toHaveBeenCalled();

  view.rerender(<MarkdownEditor nodeId="node-2" onChange={vi.fn()} value="Other node" />);
  view.rerender(
    <MarkdownEditor nodeId="node-1" nodeViewState={nodeViewState} onChange={vi.fn()} value={longDocument} />
  );

  await expectRestoredViewState(nodeViewState);
  expect(mockMarkNodePositionRequested).toHaveBeenLastCalledWith('node-1');
  await waitFor(() => {
    expect(mockMarkNodePositionReady).toHaveBeenLastCalledWith('node-1');
  });
});

it('waits for on-demand content to load before restoring a saved mid-document position', async () => {
  const longDocument = createLongDocument();
  const nodeViewState = {
    scrollTop: 5_400,
    selection: { from: 48_000, to: 48_024 }
  };
  const view = renderEditor(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="Initial body" />);

  mockSetSelection.mockClear();
  mockRevealSelection.mockClear();

  view.rerender(<MarkdownEditor nodeId="node-2" onChange={vi.fn()} value="Other node" />);
  view.rerender(<MarkdownEditor nodeId="node-1" nodeViewState={nodeViewState} onChange={vi.fn()} value="" />);

  expect(mockSetSelection).not.toHaveBeenCalled();
  expect(mockRevealSelection).not.toHaveBeenCalled();

  view.rerender(<MarkdownEditor nodeId="node-1" nodeViewState={nodeViewState} onChange={vi.fn()} value={longDocument} />);

  await expectRestoredViewState(nodeViewState);
  expect(mockMarkNodePositionRequested).toHaveBeenLastCalledWith('node-1');
  await waitFor(() => {
    expect(mockMarkNodePositionReady).toHaveBeenLastCalledWith('node-1');
  });
});

it('waits for on-demand content to load before restoring a saved scroll-only position', async () => {
  const longDocument = createLongDocument();
  const nodeViewState = {
    scrollTop: 5_400,
    selection: { from: 0, to: 0 }
  };
  const view = renderEditor(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="Initial body" />);

  mockSetSelection.mockClear();
  mockRevealSelection.mockClear();
  mockRestoreSelection.mockClear();
  mockSetScrollTop.mockClear();

  view.rerender(<MarkdownEditor nodeId="node-2" onChange={vi.fn()} value="Other node" />);
  view.rerender(<MarkdownEditor nodeId="node-1" nodeViewState={nodeViewState} onChange={vi.fn()} value="" />);

  expect(mockRestoreSelection).not.toHaveBeenCalled();
  expect(mockSetScrollTop).not.toHaveBeenCalled();

  view.rerender(<MarkdownEditor nodeId="node-1" nodeViewState={nodeViewState} onChange={vi.fn()} value={longDocument} />);

  await expectRestoredViewState(nodeViewState);
});

it('does not reapply a saved selection while typing in the same node', async () => {
  const longDocument = createLongDocument();
  const nodeViewState = {
    scrollTop: 5_400,
    selection: { from: 48_000, to: 48_024 }
  };
  const view = renderEditor(
    <MarkdownEditor nodeId="node-1" nodeViewState={nodeViewState} onChange={vi.fn()} value={longDocument} />
  );

  expect(mockRestoreSelection).toHaveBeenCalledTimes(1);
  expect(mockRevealSelection).not.toHaveBeenCalled();
  expect(mockMarkNodePositionRequested).toHaveBeenCalledTimes(1);
  await waitFor(() => {
    expect(mockMarkNodePositionReady).toHaveBeenCalledTimes(1);
  });

  view.rerender(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={nodeViewState}
      onChange={vi.fn()}
      value={`${longDocument}a`}
    />
  );

  expect(mockRestoreSelection).toHaveBeenCalledTimes(1);
  expect(mockRevealSelection).not.toHaveBeenCalled();
  expect(mockMarkNodePositionRequested).toHaveBeenCalledTimes(1);
  expect(mockMarkNodePositionReady).toHaveBeenCalledTimes(1);
});

it('prefers the current reading selection over the stale saved selection', async () => {
  const longDocument = createLongDocument();
  const nodeViewState = {
    scrollTop: 5_400,
    selection: { from: 48_000, to: 48_024 }
  };
  const readingSelection = { from: 51_200, to: 51_228 };

  renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={nodeViewState}
      onChange={vi.fn()}
      readingSelection={readingSelection}
      value={longDocument}
    />
  );

  expect(mockRestoreSelection).toHaveBeenLastCalledWith({
    from: readingSelection.from,
    to: readingSelection.from
  });
  expect(mockRestoreSelection).not.toHaveBeenCalledWith(nodeViewState.selection);
  await waitFor(() => {
    expect(mockSetScrollTop).toHaveBeenLastCalledWith(nodeViewState.scrollTop);
  });
});

it('locks reading-position sync while restoring a saved selection', async () => {
  const onBeginApplyingReadingPosition = vi.fn();
  const onCompleteApplyingReadingPosition = vi.fn();
  const onSetReadingPositionSelection = vi.fn();

  renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onBeginApplyingReadingPosition={onBeginApplyingReadingPosition}
      onChange={vi.fn()}
      onCompleteApplyingReadingPosition={onCompleteApplyingReadingPosition}
      onSetReadingPositionSelection={onSetReadingPositionSelection}
      value={createLongDocument()}
    />
  );

  expect(onBeginApplyingReadingPosition).toHaveBeenCalledWith(
    { from: 48_000, to: 48_000 },
    'editor-restore-selection'
  );
  expect(onSetReadingPositionSelection).toHaveBeenCalledWith({ from: 48_000, to: 48_000 });
  await waitFor(() => {
    expect(onCompleteApplyingReadingPosition).toHaveBeenCalledWith('editor-restore-selection-settled');
  });
});
