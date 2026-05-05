import { render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockDestroy = vi.fn();
const mockSetContent = vi.fn();
const mockSetDiffDecorations = vi.fn();
const mockSetHideTitleHeading = vi.fn();
const mockSetSelection = vi.fn();
const mockRevealSelection = vi.fn();
const mockOnScroll = vi.fn(() => () => undefined);

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    destroy() {
      mockDestroy();
    }
    focus() {}
    getContent() {
      return '';
    }
    getDocumentPositionAtViewportY() {
      return 0;
    }
    getLineBlockHeight() {
      return 24;
    }
    setContent(content: string) {
      mockSetContent(content);
    }
    setDiffDecorations(diffDecorations: unknown) {
      mockSetDiffDecorations(diffDecorations);
    }
    setHideTitleHeading(value: boolean) {
      mockSetHideTitleHeading(value);
    }
    getSelection() {
      return { from: 0, to: 0 };
    }
    setSelection(selection: { from: number; to: number }) {
      mockSetSelection(selection);
    }
    revealSelection(selection: { from: number; to: number }) {
      mockRevealSelection(selection);
    }
    getScrollTop() {
      return 0;
    }
    setScrollTop() {}
    getScrollMetrics() {
      return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 };
    }
    replaceSelection() {}
    onContentChange() {
      return () => undefined;
    }
    onScroll() {
      return mockOnScroll();
    }
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
  mockDestroy.mockClear();
  mockSetContent.mockClear();
  mockSetDiffDecorations.mockClear();
  mockSetHideTitleHeading.mockClear();
  mockSetSelection.mockClear();
  mockRevealSelection.mockClear();
  mockOnScroll.mockClear();
});

it('restores mid-document selection and scroll when reopening a long document', () => {
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

  expect(mockSetSelection).not.toHaveBeenCalled();
  expect(mockRevealSelection).toHaveBeenLastCalledWith(nodeViewState.selection);
});

it('waits for on-demand content to load before restoring a saved mid-document position', () => {
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

  expect(mockSetSelection).not.toHaveBeenCalled();
  expect(mockRevealSelection).toHaveBeenLastCalledWith(nodeViewState.selection);
});
