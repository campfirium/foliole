import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  registerImageClozeEditorPresentation,
  unregisterImageClozeEditorPresentation
} from '../../image-cloze/model/imageClozePresentation';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockDestroy = vi.fn();
const mockGetScrollMetrics = vi.fn(() => ({ clientHeight: 0, scrollHeight: 0, scrollTop: 0 }));
const mockGetContent = vi.fn(() => '');
const mockSetContent = vi.fn();
const mockSetDiffDecorations = vi.fn();
const mockSetHideTitleHeading = vi.fn();
const mockSetNodeId = vi.fn();
const mockRefreshImageClozePresentation = vi.fn();
const mockSetSelection = vi.fn();
const mockSetScrollTop = vi.fn();
const mockOnScroll = vi.fn(() => () => undefined);
const mockResizeObserver = vi.fn();

const mockCtor = vi.fn();

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    constructor(host: HTMLElement, options: { initialContent: string; onChange?: (content: string) => void }) {
      mockCtor(host, options);
    }
    destroy() {
      mockDestroy();
    }
    focus() {}
    getContent() {
      return mockGetContent();
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
    setNodeId(nodeId: string | null) {
      mockSetNodeId(nodeId);
    }
    refreshImageClozePresentation() {
      mockRefreshImageClozePresentation();
    }
    getSelection() {
      return { from: 0, to: 0 };
    }
    setSelection(selection: { from: number; to: number }) {
      mockSetSelection(selection);
    }
    restoreSelection() {}
    revealSelection() {}
    getScrollTop() {
      return 0;
    }
    setScrollTop(scrollTop: number) {
      mockSetScrollTop(scrollTop);
    }
    getScrollMetrics() {
      return mockGetScrollMetrics();
    }
    replaceSelection() {}
    replaceRange() {}
    onContentChange() {
      return () => undefined;
    }
    onScroll() {
      return mockOnScroll();
    }
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderWithMouseGestureProvider(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
  });
}

function resetMocks() {
  beforeEach(() => {
    mockCtor.mockClear();
    mockDestroy.mockClear();
    mockGetContent.mockClear();
    mockSetContent.mockClear();
    mockSetDiffDecorations.mockClear();
    mockSetHideTitleHeading.mockClear();
    mockSetNodeId.mockClear();
    mockRefreshImageClozePresentation.mockClear();
    mockSetSelection.mockClear();
    mockSetScrollTop.mockClear();
    mockOnScroll.mockClear();
  });
}

describe('MarkdownEditor rendering', () => {
  resetMocks();

  beforeEach(() => {
    mockResizeObserver.mockClear();
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn().mockImplementation(() => {
        mockResizeObserver();
        return {
          disconnect: vi.fn(),
          observe: vi.fn(),
          unobserve: vi.fn()
        };
      })
    );
  });

  it('does not recreate editor adapter when value changes', () => {
    const onChange = vi.fn();
    const view = renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={onChange} value="a" />);

    expect(mockCtor).toHaveBeenCalledTimes(1);
    expect(mockDestroy).not.toHaveBeenCalled();

    view.rerender(<MarkdownEditor nodeId="node-1" onChange={onChange} value="ab" />);

    expect(mockCtor).toHaveBeenCalledTimes(1);
    expect(mockDestroy).not.toHaveBeenCalled();

    view.unmount();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('applies custom bottom padding when requested', () => {
    const { container } = renderWithMouseGestureProvider(
      <MarkdownEditor contentPaddingBottom="min(68dvh, 36rem)" nodeId="node-1" onChange={vi.fn()} value="a" />
    );

    expect(container.firstChild).toHaveStyle('--editor-content-padding-bottom: min(68dvh, 36rem)');
  });

  it('marks the editor host when viewport-based image fitting is enabled', () => {
    const { container } = renderWithMouseGestureProvider(
      <MarkdownEditor fitBlockImagesToViewport nodeId="node-1" onChange={vi.fn()} value="![Cover](https://example.com/cover.png)" />
    );

    expect(container.querySelector('.markdown-editor-host')).toHaveAttribute('data-fit-block-images', 'true');
  });

  it('skips image observers for plain-text content when viewport-based image fitting is enabled', () => {
    const onChange = vi.fn();
    const view = renderWithMouseGestureProvider(
      <MarkdownEditor fitBlockImagesToViewport nodeId="node-1" onChange={onChange} value="plain text only" />
    );

    view.rerender(<MarkdownEditor fitBlockImagesToViewport nodeId="node-1" onChange={onChange} value="plain text only updated" />);

    expect(mockResizeObserver).toHaveBeenCalledTimes(1);
  });

  it('updates title-heading visibility without recreating editor adapter', () => {
    const onChange = vi.fn();
    const view = renderWithMouseGestureProvider(<MarkdownEditor hideTitleHeading={false} nodeId="node-1" onChange={onChange} value="a" />);

    expect(mockCtor).toHaveBeenCalledTimes(1);

    view.rerender(<MarkdownEditor hideTitleHeading={true} nodeId="node-1" onChange={onChange} value="a" />);

    expect(mockCtor).toHaveBeenCalledTimes(1);
    expect(mockSetHideTitleHeading).toHaveBeenCalledWith(true);
  });

});

describe('MarkdownEditor image cloze refresh', () => {
  resetMocks();

  it('refreshes image cloze presentation when external image regions are registered', async () => {
    renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="![Cover](asset://hash-1.png)" />);

    await waitFor(() => {
      expect(mockSetNodeId).toHaveBeenCalledWith('node-1');
    });

    act(() => {
      registerImageClozeEditorPresentation('node-1', {
        canCreate: true,
        focusRegionId: null,
        hiddenRegionIds: ['region-1'],
        outlinedRegionIds: [],
        regions: [
          {
            attachmentId: 'hash-1',
            height: 0.2,
            id: 'region-1',
            width: 0.3,
            x: 0.1,
            y: 0.2
          }
        ]
      });
    });

    await waitFor(() => {
      expect(mockRefreshImageClozePresentation).toHaveBeenCalled();
    });

    act(() => {
      unregisterImageClozeEditorPresentation('node-1');
    });
  });
});
