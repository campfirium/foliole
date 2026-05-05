import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfSearchStatus, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { PdfViewportDocument } from './PdfDocumentViewportRenderParts';
import type { PdfPageDimensions } from './pdfPageDimensions';
import type { PdfPageTextEntry } from './pdfPageText';
import { PdfViewportToolbar } from './PdfViewportToolbar';

interface PdfDocumentViewportContentBodyProps {
  handleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleScroll: () => void;
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  isToolbarVisible: boolean;
  maxPage: number;
  onClearSearch: () => void;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchFocusChange: (focused: boolean) => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRequest: (direction: 'next' | 'previous') => void;
  onSetFitWidth: () => void;
  onSetZoom: (value: number) => void;
  onToolbarActiveChange: (active: boolean) => void;
  onTextLayerRender: (pageNumber: number) => void;
  onToolbarInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  visiblePage: number;
  page: number;
  pageJumpRequest: PdfJumpRequest | null;
  pageElementsRef: PdfPageElementsRef;
  persistedPageCount: number | null;
  persistedPageDimensions: Record<number, PdfPageDimensions>;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  rotation: number;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  searchIndexingHint: string | null;
  searchHighlights: PdfSearchVisualHighlight[];
  searchQuery: string;
  searchStatus: PdfSearchStatus;
  totalPages: number | null;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

function PdfDocumentLoadingOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
      data-testid="pdf-document-loading-overlay"
    >
      <div aria-hidden="true" className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-foreground/65" />
    </div>
  );
}

function isPdfShellLoading(shell: HTMLDivElement | null) {
  if (!shell) {
    return true;
  }
  if (shell.dataset.pdfPageState === 'placeholder') {
    return true;
  }
  return shell.querySelector('.react-pdf__Page,[data-testid="pdf-document-page"],canvas,.textLayer') === null;
}

function useFitWidthTargetWidth(scrollContainerRef: MutableRefObject<HTMLDivElement | null>) {
  const [targetWidth, setTargetWidth] = useState<number | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const updateTargetWidth = () => {
      setTargetWidth(container.clientWidth > 48 ? Math.max(160, container.clientWidth - 48) : null);
    };
    updateTargetWidth();
    window.addEventListener('resize', updateTargetWidth);
    return () => window.removeEventListener('resize', updateTargetWidth);
  }, [scrollContainerRef]);

  return targetWidth;
}

function useDisplayedPdfZoom(args: {
  fitWidthTargetWidth: number | null;
  visiblePage: number;
  zoom: number;
  zoomMode: 'custom' | 'fit-width';
}) {
  const [baseWidthByPage, setBaseWidthByPage] = useState<Record<number, number>>({});
  const displayedZoom =
    args.zoomMode === 'fit-width' && args.fitWidthTargetWidth && baseWidthByPage[args.visiblePage]
      ? Math.max(1, Math.round((args.fitWidthTargetWidth / baseWidthByPage[args.visiblePage]) * 100))
      : args.zoom;

  const handlePageLoadSuccess = (pageNumber: number, dimensions: PdfPageDimensions) => {
    setBaseWidthByPage((current) =>
      current[pageNumber] === dimensions.width ? current : { ...current, [pageNumber]: dimensions.width }
    );
  };

  return { displayedZoom, handlePageLoadSuccess };
}

function useViewportPageLoadingState(
  pageJumpRequest: PdfJumpRequest | null,
  pageElementsRef: PdfPageElementsRef,
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>
) {
  const [isViewportPageLoading, setIsViewportPageLoading] = useState(false);

  useEffect(() => {
    if (!pageJumpRequest) {
      setIsViewportPageLoading(false);
      return;
    }
    let frameId = 0;
    let observer: MutationObserver | null = null;

    const resolveTargetShell = () => pageElementsRef.current[pageJumpRequest.page] ?? null;
    const updateLoadingState = () => {
      const nextIsLoading = isPdfShellLoading(resolveTargetShell());
      setIsViewportPageLoading(nextIsLoading);
      return nextIsLoading;
    };
    const attachObserver = () => {
      const container = scrollContainerRef.current;
      if (!container) {
        frameId = window.requestAnimationFrame(attachObserver);
        return;
      }
      if (!updateLoadingState()) {
        return;
      }
      observer = new MutationObserver(() => {
        if (!updateLoadingState()) {
          observer?.disconnect();
          observer = null;
        }
      });
      observer.observe(container, { attributeFilter: ['data-pdf-page-state'], attributes: true, childList: true, subtree: true });
    };

    setIsViewportPageLoading(true);
    attachObserver();
    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
    };
  }, [pageElementsRef, pageJumpRequest, scrollContainerRef]);

  return isViewportPageLoading;
}

export function PdfDocumentViewportContentBody(props: PdfDocumentViewportContentBodyProps) {
  const fitWidthTargetWidth = useFitWidthTargetWidth(props.scrollContainerRef);
  const { displayedZoom, handlePageLoadSuccess } = useDisplayedPdfZoom({
    fitWidthTargetWidth,
    visiblePage: props.visiblePage,
    zoom: props.zoom,
    zoomMode: props.zoomMode
  });
  const [isInitialRenderReady, setIsInitialRenderReady] = useState(false);
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const isViewportPageLoading = useViewportPageLoadingState(props.pageJumpRequest, props.pageElementsRef, props.scrollContainerRef);
  const previousPdfSourceRef = useRef(props.pdfSource);

  useEffect(() => {
    if (previousPdfSourceRef.current === props.pdfSource) {
      return;
    }
    previousPdfSourceRef.current = props.pdfSource;
    setIsInitialRenderReady(false);
    setIsLayoutReady(false);
  }, [props.pdfSource]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {!isLayoutReady || !isInitialRenderReady || isViewportPageLoading ? <PdfDocumentLoadingOverlay /> : null}
      <div
        className={`app-scrollbar flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-auto px-2 pb-5 ${isLayoutReady ? '' : 'overflow-hidden'}`}
        onContextMenu={props.handleContextMenu}
        onScroll={props.handleScroll}
        data-testid="pdf-scroll-container"
        ref={props.scrollContainerRef}
      >
        {isLayoutReady && props.totalPages ? renderViewportToolbar(props, displayedZoom) : null}
        {renderViewportDocument(props, fitWidthTargetWidth, handlePageLoadSuccess, setIsInitialRenderReady, setIsLayoutReady)}
      </div>
    </div>
  );
}

function renderViewportToolbar(props: PdfDocumentViewportContentBodyProps, displayedZoom: number) {
  return (
    <PdfViewportToolbar
      displayPage={props.visiblePage}
      isVisible={props.isToolbarVisible}
      maxPage={props.maxPage}
      onClearSearch={props.onClearSearch}
      onNextPage={props.onNextPage}
      onPageChange={props.onPageChange}
      onPreviousPage={props.onPreviousPage}
      onRotateClockwise={props.onRotateClockwise}
      onSearchFocusChange={props.onSearchFocusChange}
      searchIndexingHint={props.searchIndexingHint}
      onSearchQueryChange={props.onSearchQueryChange}
      onSearchRequest={props.onSearchRequest}
      onSetFitWidth={props.onSetFitWidth}
      onSetZoom={props.onSetZoom}
      onToolbarActiveChange={props.onToolbarActiveChange}
      onToolbarInteraction={props.onToolbarInteraction}
      onZoomIn={props.onZoomIn}
      onZoomOut={props.onZoomOut}
      page={props.page}
      searchQuery={props.searchQuery}
      searchStatus={props.searchStatus}
      zoomMode={props.zoomMode}
      zoom={displayedZoom}
    />
  );
}

function renderViewportDocument(
  props: PdfDocumentViewportContentBodyProps,
  fitWidthTargetWidth: number | null,
  handlePageLoadSuccess: (pageNumber: number, dimensions: PdfPageDimensions) => void,
  onInitialRenderReadyChange: (ready: boolean) => void,
  onLayoutReadyChange: (ready: boolean) => void
) {
  return (
    <PdfViewportDocument
      fitWidthTargetWidth={fitWidthTargetWidth}
      highlightLocators={props.highlightLocators}
      onInitialRenderReadyChange={onInitialRenderReadyChange}
      onLayoutReadyChange={onLayoutReadyChange}
      onLoadError={props.onLoadError}
      onLoadSuccess={props.onLoadSuccess}
      onPageLoadSuccess={handlePageLoadSuccess}
      onTextContentLoad={props.onTextContentLoad}
      onTextLayerRender={props.onTextLayerRender}
      page={props.page}
      pageElementsRef={props.pageElementsRef}
      persistedPageCount={props.persistedPageCount}
      persistedPageDimensions={props.persistedPageDimensions}
      pdfSelectionLocator={props.pdfSelectionLocator}
      pdfSource={props.pdfSource}
      rotation={props.rotation}
      searchQuery={props.searchQuery}
      searchHighlights={props.searchHighlights}
      totalPages={props.totalPages}
      visiblePage={props.visiblePage}
      zoomMode={props.zoomMode}
      zoom={props.zoom}
    />
  );
}
