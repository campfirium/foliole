import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockDestroy = vi.fn();
const mockGetScrollMetrics = vi.fn(() => ({ clientHeight: 0, scrollHeight: 0, scrollTop: 0 }));
const mockGetContent = vi.fn(() => '');
const mockSetContent = vi.fn();
const mockSetDiffDecorations = vi.fn();
const mockSetSearchDecorations = vi.fn();
const mockSetTextAnchorDecorations = vi.fn();
const mockSetHideTitleHeading = vi.fn();
const mockSetNodeId = vi.fn();
const mockRefreshImageClozePresentation = vi.fn();
const mockSetSelection = vi.fn();
const mockSetScrollTop = vi.fn();
const mockOnScroll = vi.fn(() => () => undefined);
const mockResizeObserver = vi.fn();

const mockCtor = vi.fn();
let currentContent = '';

function createMockCodeMirrorEditorAdapterClass() {
  return class {
    constructor(host: HTMLElement, options: { initialContent: string; onChange?: (content: string) => void }) {
      currentContent = options.initialContent;
      mockCtor(host, options);
    }
    destroy() { mockDestroy(); }
    focus() {}
    getContent() { return mockGetContent() || currentContent; }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    setContent(content: string) { currentContent = content; mockSetContent(content); }
    setDiffDecorations(diffDecorations: unknown) { mockSetDiffDecorations(diffDecorations); }
    setSearchDecorations(searchDecorations: unknown) { mockSetSearchDecorations(searchDecorations); }
    setTextAnchorDecorations(textAnchorDecorations: unknown) { mockSetTextAnchorDecorations(textAnchorDecorations); }
    setHideTitleHeading(value: boolean) { mockSetHideTitleHeading(value); }
    setNodeId(nodeId: string | null) { mockSetNodeId(nodeId); }
    refreshImageClozePresentation() { mockRefreshImageClozePresentation(); }
    getSelection() { return { from: 0, to: 0 }; }
    setParagraphMarker() {}
    setSelection(selection: { from: number; to: number }) { mockSetSelection(selection); }
    restoreSelection() {}
    revealSelection() {}
    getScrollTop() { return 0; }
    setScrollTop(scrollTop: number) { mockSetScrollTop(scrollTop); }
    getScrollMetrics() { return mockGetScrollMetrics(); }
    replaceSelection() {}
    replaceRange() {}
    onContentChange() { return () => undefined; }
    onScroll() { return mockOnScroll(); }
  };
}

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: createMockCodeMirrorEditorAdapterClass()
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderWithMouseGestureProvider(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
  });
}

function mockResizeObserverFactory() {
  mockResizeObserver();
  return {
    disconnect: vi.fn(),
    observe: vi.fn(),
    unobserve: vi.fn()
  };
}

function resetMocks() {
  beforeEach(() => {
    currentContent = '';
    mockCtor.mockClear();
    mockDestroy.mockClear();
    mockGetContent.mockClear();
    mockSetContent.mockClear();
    mockSetDiffDecorations.mockClear();
    mockSetSearchDecorations.mockClear();
    mockSetTextAnchorDecorations.mockClear();
    mockSetHideTitleHeading.mockClear();
    mockSetNodeId.mockClear();
    mockRefreshImageClozePresentation.mockClear();
    mockSetSelection.mockClear();
    mockSetScrollTop.mockClear();
    mockOnScroll.mockClear();
  });
}

function setupRenderingSuite() {
  resetMocks();
  beforeEach(() => {
    mockResizeObserver.mockClear();
    vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(mockResizeObserverFactory));
  });
}

function registerEditorLifecycleStabilityTests() {
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

  it('updates title-heading visibility without recreating editor adapter', () => {
    const onChange = vi.fn();
    const view = renderWithMouseGestureProvider(<MarkdownEditor hideTitleHeading={false} nodeId="node-1" onChange={onChange} value="a" />);

    expect(mockCtor).toHaveBeenCalledTimes(1);

    view.rerender(<MarkdownEditor hideTitleHeading={true} nodeId="node-1" onChange={onChange} value="a" />);

    expect(mockCtor).toHaveBeenCalledTimes(1);
    expect(mockSetHideTitleHeading).toHaveBeenCalledWith(true);
  });

  it('does not recreate editor adapter when the node-link callback changes identity', () => {
    const onChange = vi.fn();
    const view = renderWithMouseGestureProvider(
      <MarkdownEditor nodeId="node-1" onChange={onChange} onOpenNodeLink={() => undefined} value="a" />
    );

    expect(mockCtor).toHaveBeenCalledTimes(1);

    view.rerender(
      <MarkdownEditor nodeId="node-1" onChange={onChange} onOpenNodeLink={() => undefined} value="a" />
    );

    expect(mockCtor).toHaveBeenCalledTimes(1);
    expect(mockDestroy).not.toHaveBeenCalled();
  });

}

function registerEditorPresentationUpdateTests() {
  registerTextAnchorUpdateTests();
}

function registerTextAnchorUpdateTests() {
  registerTextAnchorRefreshTest();
  registerUnchangedTextAnchorRerenderTest();
}

function registerTextAnchorRefreshTest() {
  it('updates text anchor decorations without recreating editor adapter', () => {
    vi.useFakeTimers();
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((handle: number) => window.clearTimeout(handle));
    const onChange = vi.fn();
    try {
      const view = renderWithMouseGestureProvider(
        <MarkdownEditor
          nodeId="node-1"
          onChange={onChange}
          textAnchorDecorations={[{ from: 1, kind: 'highlight', to: 4 }]}
          value="Alpha"
        />
      );

      act(() => {
        view.rerender(
          <MarkdownEditor
            nodeId="node-1"
            onChange={onChange}
            textAnchorDecorations={[{ from: 6, kind: 'cloze', to: 10 }]}
            value="Alpha Beta"
          />
        );
      });

      act(() => {
        vi.runAllTimers();
      });

      expect(mockCtor).toHaveBeenCalledTimes(1);
      expect(mockSetTextAnchorDecorations).toHaveBeenCalledWith([{ from: 6, kind: 'cloze', to: 10 }]);
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
      vi.useRealTimers();
    }
  });
}

function registerUnchangedTextAnchorRerenderTest() {
  it('does not resend unchanged text anchor decorations on rerender', () => {
    const onChange = vi.fn();
    const view = renderWithMouseGestureProvider(
      <MarkdownEditor
        nodeId="node-1"
        onChange={onChange}
        textAnchorDecorations={[{ from: 1, kind: 'highlight', to: 4 }]}
        value="Alpha"
      />
    );

    mockSetTextAnchorDecorations.mockClear();

    view.rerender(
      <MarkdownEditor
        nodeId="node-1"
        onChange={onChange}
        textAnchorDecorations={[{ from: 1, kind: 'highlight', to: 4 }]}
        value="Alpha"
      />
    );

    expect(mockSetTextAnchorDecorations).not.toHaveBeenCalled();
  });
}

function registerRenderingSurfaceTests() {
  it('applies custom bottom padding when requested', () => {
    const { container } = renderWithMouseGestureProvider(
      <MarkdownEditor contentPaddingBottom="min(68dvh, 36rem)" nodeId="node-1" onChange={vi.fn()} value="a" />
    );

    expect(container.querySelector('.markdown-editor-host')).toHaveStyle('--editor-content-padding-bottom: min(68dvh, 36rem)');
  });

  it('applies custom block image width when requested', () => {
    const { container } = renderWithMouseGestureProvider(
      <MarkdownEditor blockImageWidthOverride="min(100%, 40rem)" nodeId="node-1" onChange={vi.fn()} value="![Cover](https://example.com/cover.png)" />
    );

    expect(container.querySelector('.markdown-editor-host')).toHaveStyle('--editor-image-block-width: min(100%, 40rem)');
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

    expect(mockResizeObserver).not.toHaveBeenCalled();
  });
}

describe('MarkdownEditor rendering', () => {
  setupRenderingSuite();
  registerEditorLifecycleStabilityTests();
  registerEditorPresentationUpdateTests();
  registerRenderingSurfaceTests();
});
