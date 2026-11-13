import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react';

import { type PdfSelectionLocator } from '../../features/nodes/model/nodeTypes';
import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import { PdfDocumentLoadingOverlay } from './PdfDocumentLoadingOverlay';
import type { PdfSearchStatus, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { PdfViewportDocument } from './PdfDocumentViewportRenderParts';
import { useDisplayedPdfZoom, useFitWidthTargetWidth } from './PdfDocumentViewportSizing';
import type { PdfPageDimensions } from './pdfPageDimensions';
import type { PdfPageTextEntry } from './pdfPageText';
import { PdfViewportToolbar } from './PdfViewportToolbar';
import { stepPdfFitWidthZoom, usePdfExpandedWidth, type PdfExpandedWidthToggle } from './usePdfExpandedWidth';
import { usePdfHeightFitView } from './usePdfHeightFitView';
import { usePdfViewportTransformAnchor } from './usePdfViewportTransformAnchor';

interface PdfDocumentViewportContentBodyProps {
  handleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleScroll: () => void;
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  isToolbarVisible: boolean;
  maxPage: number;
  onClearSearch: () => void;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onPositionReadyChange?: (ready: boolean) => void;
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
  positionY: number;
  pageJumpRequest: PdfJumpRequest | null;
  pageElementsRef: PdfPageElementsRef;
  persistedPageCount: number | null;
  persistedPageDimensions: Record<number, PdfPageDimensions>;
  pdfSelectionLocator: PdfSelectionLocator | undefined;
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

function isPdfShellLoading(shell: HTMLDivElement | null) {
  if (!shell) {
    return true;
  }
  if (shell.dataset.pdfPageState === 'placeholder') {
    return true;
  }
  return shell.querySelector('.react-pdf__Page,[data-testid="pdf-document-page"],canvas,.textLayer') === null;
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
  const [isInitialRenderReady, setIsInitialRenderReady] = useState(false);
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const isViewportPageLoading = useViewportPageLoadingState(props.pageJumpRequest, props.pageElementsRef, props.scrollContainerRef);
  const heightView = usePdfHeightFitView(props, isLayoutReady && isInitialRenderReady);
  const adapted = heightView.props;
  const handleScroll = usePdfViewportTransformAnchor(props, {
    ready: isLayoutReady && !props.pageJumpRequest,
    transform: heightView.isHeightFit ? 'fit-height' :
      `${adapted.rotation}:${adapted.zoomMode}:${adapted.zoomMode === 'fit-width' ? fitWidthTargetWidth : adapted.zoom}`,
    heightFit: heightView.isHeightFit
  });
  useEffect(() => {
    props.onPositionReadyChange?.(isLayoutReady && isInitialRenderReady);
  }, [isInitialRenderReady, isLayoutReady, props.onPositionReadyChange]);
  const { displayedZoom, handlePageLoadSuccess, visibleDimensions } = useDisplayedPdfZoom({
    fitWidthTargetWidth,
    visiblePage: adapted.visiblePage,
    rotation: adapted.rotation,
    zoom: adapted.zoom,
    zoomMode: adapted.zoomMode
  });
  const expandedWidth = usePdfExpandedWidth({
    dimensions: props.persistedPageDimensions[adapted.visiblePage] ?? visibleDimensions,
    fitWidth: fitWidthTargetWidth,
    onSetZoom: adapted.onSetZoom,
    ready: isLayoutReady,
    rotation: adapted.rotation,
    zoom: adapted.zoom,
    zoomMode: adapted.zoomMode
  });
  const toolbarProps = resolvePdfWidthToolbarActions(adapted, expandedWidth);
  const registerDimensions = (page: number, dimensions: PdfPageDimensions) => {
    handlePageLoadSuccess(page, dimensions);
    heightView.registerDimensions(page, dimensions);
  };

  useResetPdfLayoutOnSourceChange(props.pdfSource, setIsInitialRenderReady, setIsLayoutReady);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {!isLayoutReady || !isInitialRenderReady || isViewportPageLoading ? <PdfDocumentLoadingOverlay /> : null}
      <div
        className={`pdf-document-scroll-container app-scrollbar flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-auto px-2 pb-5 ${isLayoutReady ? '' : 'overflow-hidden'}`}
        onContextMenu={props.handleContextMenu}
        onScroll={handleScroll}
        data-testid="pdf-scroll-container"
        ref={props.scrollContainerRef}
      >
        {isLayoutReady && props.totalPages ? renderViewportToolbar(toolbarProps, displayedZoom, expandedWidth.toggle) : null}
        {renderViewportDocument(adapted, fitWidthTargetWidth, registerDimensions, setIsInitialRenderReady, setIsLayoutReady)}
      </div>
    </div>
  );
}

function useResetPdfLayoutOnSourceChange(
  pdfSource: string, setIsInitialRenderReady: (ready: boolean) => void, setIsLayoutReady: (ready: boolean) => void
) {
  const previousPdfSourceRef = useRef(pdfSource);
  useEffect(() => {
    if (previousPdfSourceRef.current === pdfSource) {
      return;
    }
    previousPdfSourceRef.current = pdfSource;
    setIsInitialRenderReady(false);
    setIsLayoutReady(false);
  }, [pdfSource, setIsInitialRenderReady, setIsLayoutReady]);
}

function resolvePdfWidthToolbarActions(
  props: PdfDocumentViewportContentBodyProps, width: ReturnType<typeof usePdfExpandedWidth>
) {
  const fittedZoom = props.zoomMode === 'fit-width' ? width.fittedZoom : null;
  const fitWidthZoom = width.fitWidthZoom;
  return {
    ...props,
    onSetFitWidth: fitWidthZoom === null ? props.onSetFitWidth : () => props.onSetZoom(fitWidthZoom),
    onZoomIn: fittedZoom === null ? props.onZoomIn : () => props.onSetZoom(stepPdfFitWidthZoom(fittedZoom, 1)),
    onZoomOut: fittedZoom === null ? props.onZoomOut : () => props.onSetZoom(stepPdfFitWidthZoom(fittedZoom, -1))
  };
}

function renderViewportToolbar(
  props: PdfDocumentViewportContentBodyProps, displayedZoom: number, expandedWidth: PdfExpandedWidthToggle | undefined
) {
  return (
    <PdfViewportToolbar
      displayPage={props.visiblePage}
      expandedWidth={expandedWidth}
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
      pageJumpRequest={props.pageJumpRequest}
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
