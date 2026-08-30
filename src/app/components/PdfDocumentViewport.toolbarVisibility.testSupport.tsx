import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { expect, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

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
import { PdfVisualExcerptRuntimeProvider } from './PdfVisualExcerptRuntime';

export { collectTextSegmentsSpy };

function useToolbarReplayScroll(page: number, zoom: number, shouldReplayToolbarScrollRef: MutableRefObject<boolean>) {
  useEffect(() => {
    if (!shouldReplayToolbarScrollRef.current) return;
    shouldReplayToolbarScrollRef.current = false;
    const scrollContainer = screen.getByTestId('pdf-scroll-container');
    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      value: 24,
      writable: true
    });
    fireEvent.scroll(scrollContainer);
  }, [page, zoom, shouldReplayToolbarScrollRef]);
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

function ToolbarVisibilityHarness() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState({ current: 0, hasQuery: false, total: 0 });
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const shouldReplayToolbarScrollRef = useRef(false);

  useToolbarReplayScroll(page, zoom, shouldReplayToolbarScrollRef);

  return (
    <PdfVisualExcerptRuntimeProvider currentPage={page} locators={[]} nodeId="pdf-1" rotation={0} source="/tmp/sample.pdf">
      <PdfDocumentViewport
        {...buildBaseToolbarHarnessProps()}
        onNextPage={createToolbarReplayAction(shouldReplayToolbarScrollRef, () => setPage((current) => current + 1))}
        onPageChange={setPage}
        onPreviousPage={createToolbarReplayAction(shouldReplayToolbarScrollRef, () => setPage((current) => Math.max(1, current - 1)))}
        onSearchQueryChange={setSearchQuery}
        onSearchStatusChange={setSearchStatus}
        onSetFitWidth={createToolbarReplayAction(shouldReplayToolbarScrollRef)}
        onSetZoom={(value) => {
          shouldReplayToolbarScrollRef.current = true;
          setZoom(value);
        }}
        onZoomIn={createToolbarReplayAction(shouldReplayToolbarScrollRef, () => setZoom((current) => current + 10))}
        onZoomOut={createToolbarReplayAction(shouldReplayToolbarScrollRef, () => setZoom((current) => current - 10))}
        page={page}
        searchQuery={searchQuery}
        searchStatus={searchStatus}
        visiblePage={page}
        zoom={zoom}
      />
    </PdfVisualExcerptRuntimeProvider>
  );
}

export function setScrollTopAndScroll(container: HTMLElement, scrollTop: number) {
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    value: scrollTop,
    writable: true
  });
  fireEvent.scroll(container);
}

export async function renderToolbarVisibilityHarness() {
  renderWithLocalization(<ToolbarVisibilityHarness />);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  return {
    scrollContainer: screen.getByTestId('pdf-scroll-container'),
    toolbar: screen.getByTestId('pdf-document-toolbar')
  };
}

export async function expectToolbarInteractionToKeepVisible(toolbar: HTMLElement, action: () => void) {
  action();
  await waitFor(() => expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true'));
}
