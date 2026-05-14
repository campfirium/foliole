import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { collectTextSegmentsSpy } = vi.hoisted(() => ({
  collectTextSegmentsSpy: vi.fn()
}));

vi.mock('react-pdf', async () => {
  const React = await import('react');
  return {
    Document: ({
      children,
      file,
      onLoadSuccess
    }: {
      children: React.ReactNode;
      file?: string;
      onLoadSuccess?: (payload: { numPages: number }) => void;
    }) => {
      React.useEffect(() => {
        onLoadSuccess?.({ numPages: 1 });
      }, [file, onLoadSuccess]);
      return <div data-testid="pdf-document-view">{children}</div>;
    },
    Page: ({
      onGetTextSuccess,
      onRenderSuccess,
      onRenderTextLayerSuccess
    }: {
      onGetTextSuccess?: (payload: { items: Array<{ str: string }> }) => void;
      onRenderSuccess?: () => void;
      onRenderTextLayerSuccess?: () => void;
    }) => {
      React.useEffect(() => {
        onRenderSuccess?.();
        onGetTextSuccess?.({ items: [{ str: 'keyword bridge content' }] });
        onRenderTextLayerSuccess?.();
      }, [onGetTextSuccess, onRenderSuccess, onRenderTextLayerSuccess]);
      return (
        <div data-testid="pdf-document-page">
          <div className="textLayer">
            <span role="presentation">keyword bridge content</span>
          </div>
        </div>
      );
    }
  };
});

vi.mock('./pdfSearchTextSegments', () => ({
  collectTextSegments: collectTextSegmentsSpy
}));

import { PdfDocumentViewport } from './PdfDocumentViewport';

function useToolbarReplayScroll(page: number, zoom: number, shouldReplayToolbarScrollRef: MutableRefObject<boolean>) {
  useEffect(() => {
    if (!shouldReplayToolbarScrollRef.current) {
      return;
    }
    shouldReplayToolbarScrollRef.current = false;
    const scrollContainer = screen.getByTestId('pdf-scroll-container');
    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      value: 24,
      writable: true
    });
    fireEvent.scroll(scrollContainer);
  }, [page, zoom]);
}

function createToolbarReplayAction(shouldReplayToolbarScrollRef: MutableRefObject<boolean>, action?: () => void) {
  return () => {
    shouldReplayToolbarScrollRef.current = true;
    action?.();
  };
}

function buildBaseToolbarHarnessProps() {
  return {
    clearPageJumpRequest: () => undefined,
    highlightLocators: [],
    loadError: null,
    maxPage: 3,
    onClearSearch: () => undefined,
    onContextMenu: () => undefined,
    onLoadError: () => undefined,
    onLoadSuccess: () => undefined,
    onRetryLoad: () => undefined,
    onPdfReadingModeChange: () => undefined,
    onRotateClockwise: () => undefined,
    onSearchRequest: () => undefined,
    onSearchRequestHandled: () => undefined,
    onSearchTargetHandled: () => undefined,
    pageJumpRequest: null,
    persistedPageCount: 3,
    persistedPageDimensions: {
      1: { height: 1131, width: 800 },
      2: { height: 1131, width: 800 },
      3: { height: 1131, width: 800 }
    },
    pdfReadingMode: 'original' as const,
    pdfSelectionLocator: undefined,
    pdfSource: '/tmp/sample.pdf',
    rotation: 0,
    searchIndexingHint: null,
    searchRequest: null,
    searchTarget: null,
    setVisibleLocation: () => undefined,
    totalPages: 3,
    zoomMode: 'fit-width' as const
  };
}

function buildToolbarHarnessProps(input: {
  page: number;
  searchQuery: string;
  searchStatus: { current: number; hasQuery: boolean; total: number };
  setPage: (value: number | ((current: number) => number)) => void;
  setSearchQuery: (value: string) => void;
  setSearchStatus: (value: { current: number; hasQuery: boolean; total: number }) => void;
  setZoom: (value: number | ((current: number) => number)) => void;
  shouldReplayToolbarScrollRef: MutableRefObject<boolean>;
  zoom: number;
}) {
  return {
    ...buildBaseToolbarHarnessProps(),
    onNextPage: createToolbarReplayAction(input.shouldReplayToolbarScrollRef, () => input.setPage((current) => current + 1)),
    onPageChange: input.setPage,
    onPreviousPage: createToolbarReplayAction(input.shouldReplayToolbarScrollRef, () => input.setPage((current) => Math.max(1, current - 1))),
    onSearchQueryChange: input.setSearchQuery,
    onSearchStatusChange: input.setSearchStatus,
    onSetFitWidth: createToolbarReplayAction(input.shouldReplayToolbarScrollRef),
    onSetZoom: (value: number) => {
      input.shouldReplayToolbarScrollRef.current = true;
      input.setZoom(value);
    },
    onZoomIn: createToolbarReplayAction(input.shouldReplayToolbarScrollRef, () => input.setZoom((current) => current + 10)),
    onZoomOut: createToolbarReplayAction(input.shouldReplayToolbarScrollRef, () => input.setZoom((current) => current - 10)),
    visiblePage: input.page,
    page: input.page,
    searchQuery: input.searchQuery,
    searchStatus: input.searchStatus,
    zoom: input.zoom
  };
}

function ToolbarVisibilityHarness() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState({ current: 0, hasQuery: false, total: 0 });
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const shouldReplayToolbarScrollRef = useRef(false);

  useToolbarReplayScroll(page, zoom, shouldReplayToolbarScrollRef);
  const viewportProps = buildToolbarHarnessProps({
    page,
    searchQuery,
    searchStatus,
    setPage,
    setSearchQuery,
    setSearchStatus,
    setZoom,
    shouldReplayToolbarScrollRef,
    zoom
  });

  return <PdfDocumentViewport {...viewportProps} />;
}

function setScrollTopAndScroll(container: HTMLElement, scrollTop: number) {
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    value: scrollTop,
    writable: true
  });
  fireEvent.scroll(container);
}

async function renderToolbarVisibilityHarness() {
  render(<ToolbarVisibilityHarness />);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  return {
    scrollContainer: screen.getByTestId('pdf-scroll-container'),
    toolbar: screen.getByTestId('pdf-document-toolbar')
  };
}

async function expectToolbarInteractionToKeepVisible(toolbar: HTMLElement, action: () => void) {
  action();
  await waitFor(() => expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true'));
}

describe('PdfDocumentViewport toolbar visibility', () => {
  it('hides on downward scroll and returns on upward scroll', async () => {
    collectTextSegmentsSpy.mockReturnValue([]);
    const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();

    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 80);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 120);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');

    setScrollTopAndScroll(scrollContainer, 40);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  });

  it('stays visible while the search field is active', async () => {
    collectTextSegmentsSpy.mockImplementation((shell: HTMLDivElement) => {
      const span = shell.querySelector<HTMLElement>('.textLayer span[role="presentation"]');
      const node = span?.firstChild instanceof Text ? span.firstChild : new Text(span?.textContent ?? '');
      return span
        ? [{ element: span, end: node.textContent?.length ?? 0, node, start: 0, text: node.textContent ?? '' }]
        : [];
    });
    const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();
    const searchInput = screen.getByLabelText('PDF search');

    setScrollTopAndScroll(scrollContainer, 80);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 120);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');

    fireEvent.focus(searchInput);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    fireEvent.change(searchInput, { target: { value: 'keyword' } });
    setScrollTopAndScroll(scrollContainer, 160);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  });

  it('stays visible on the first restored scroll position before any user scroll gesture', async () => {
    collectTextSegmentsSpy.mockReturnValue([]);
    const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();

    setScrollTopAndScroll(scrollContainer, 220);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 280);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  });

  it('keeps the toolbar visible after page and zoom actions until the next reading scroll', async () => {
    collectTextSegmentsSpy.mockReturnValue([]);
    const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();

    setScrollTopAndScroll(scrollContainer, 80);
    setScrollTopAndScroll(scrollContainer, 120);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');

    await expectToolbarInteractionToKeepVisible(toolbar, () => fireEvent.click(screen.getByLabelText('Next page')));

    setScrollTopAndScroll(scrollContainer, 64);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');

    await expectToolbarInteractionToKeepVisible(toolbar, () => fireEvent.click(screen.getByLabelText('Zoom in')));

    setScrollTopAndScroll(scrollContainer, 96);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  });
});
