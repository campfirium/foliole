import type { MouseEvent as ReactMouseEvent } from 'react';
import type { MutableRefObject } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfSearchDebugInfo, PdfSearchRequest, PdfSearchStatus, PdfSearchTarget, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import { PdfViewportSearchDebugOverlay, useSearchDebugOverlayState } from './PdfDocumentViewportDebug';
import { PdfDocumentErrorState, PdfDocumentViewportContent } from './PdfDocumentViewportParts';
import type { PdfPageTextEntry } from './pdfPageText';
import { usePdfViewportRuntime } from './pdfViewportRuntime';

interface PdfDocumentViewportProps {
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  loadError: string | null;
  maxPage: number;
  onNextPage: () => void;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onSearchStatusChange: (status: PdfSearchStatus) => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRequest: (direction: 'next' | 'previous') => void;
  onSearchRequestHandled: (requestId: number) => void;
  onSearchTargetHandled: (targetId: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  pageJumpRequest: PdfJumpRequest | null;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  rotation: number;
  searchIndexingHint: string | null;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
  searchStatus: PdfSearchStatus;
  clearPageJumpRequest: (requestId: number) => void;
  setVisiblePage: (page: number) => void;
  totalPages: number | null;
  zoom: number;
}

function renderPdfViewportContent(args: {
  handleTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  handleTextLayerRender: (pageNumber: number) => void;
  handleScroll: () => void;
  onSearchDebugChange: (debug: PdfSearchDebugInfo) => void;
  onSearchHighlightsChange: (highlights: PdfSearchVisualHighlight[]) => void;
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
  pageTextByNumberRef: MutableRefObject<Record<number, PdfPageTextEntry | string>>;
  searchHighlights: PdfSearchVisualHighlight[];
  searchRevision: number;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
} & Omit<PdfDocumentViewportProps, 'clearPageJumpRequest' | 'loadError' | 'pageJumpRequest' | 'setVisiblePage'>) {
  return (
    <PdfDocumentViewportContent
      handleContextMenu={args.onContextMenu}
      handleScroll={args.handleScroll}
      highlightLocators={args.highlightLocators}
      maxPage={args.maxPage}
      onLoadError={args.onLoadError}
      onLoadSuccess={args.onLoadSuccess}
      onTextContentLoad={args.handleTextContentLoad}
      onSearchDebugChange={args.onSearchDebugChange}
      onSearchHighlightsChange={args.onSearchHighlightsChange}
      onSearchStatusChange={args.onSearchStatusChange}
      onNextPage={args.onNextPage}
      onPageChange={args.onPageChange}
      onPreviousPage={args.onPreviousPage}
      onRotateClockwise={args.onRotateClockwise}
      onSearchQueryChange={args.onSearchQueryChange}
      onSearchRequest={args.onSearchRequest}
      onSearchRequestHandled={args.onSearchRequestHandled}
      onZoomIn={args.onZoomIn}
      onZoomOut={args.onZoomOut}
      page={args.page}
      pageElementsRef={args.pageElementsRef}
      pageTextByNumberRef={args.pageTextByNumberRef}
      pdfSelectionLocator={args.pdfSelectionLocator}
      pdfSource={args.pdfSource}
      rotation={args.rotation}
      searchIndexingHint={args.searchIndexingHint}
      scrollContainerRef={args.scrollContainerRef}
      searchQuery={args.searchQuery}
      searchRevision={args.searchRevision}
      searchRequest={args.searchRequest}
      searchTarget={args.searchTarget}
      searchHighlights={args.searchHighlights}
      searchStatus={args.searchStatus}
      totalPages={args.totalPages}
      onTextLayerRender={args.handleTextLayerRender}
      onSearchTargetHandled={args.onSearchTargetHandled}
      zoom={args.zoom}
    />
  );
}

export function PdfDocumentViewport(props: PdfDocumentViewportProps) {
  const { handleScroll, handleTextContentLoad, handleTextLayerRender, pageElementsRef, pageTextByNumberRef, searchDebug, scrollContainerRef, searchHighlights, searchRevision, setSearchDebug, setSearchHighlights } =
    usePdfViewportRuntime({
      clearPageJumpRequest: props.clearPageJumpRequest,
      page: props.page,
      pageJumpRequest: props.pageJumpRequest,
      pdfSource: props.pdfSource,
      rotation: props.rotation,
      searchQuery: props.searchQuery,
      searchRequest: props.searchRequest,
      searchTarget: props.searchTarget,
      setVisiblePage: props.setVisiblePage,
      totalPages: props.totalPages,
      zoom: props.zoom
    });
  const [isSearchDebugOpen, setIsSearchDebugOpen] = usePdfSearchDebugState(props.searchQuery, props.searchRequest, props.searchStatus, props.searchTarget, searchHighlights.length);

  if (props.loadError) {
    return <PdfDocumentErrorState loadError={props.loadError} />;
  }

  return (
    <>
      <PdfDocumentViewportReady
        handleScroll={handleScroll}
        handleTextContentLoad={handleTextContentLoad}
        handleTextLayerRender={handleTextLayerRender}
        onSearchHighlightsChange={setSearchHighlights}
        onSearchDebugChange={setSearchDebug}
        pageElementsRef={pageElementsRef}
        pageTextByNumberRef={pageTextByNumberRef}
        scrollContainerRef={scrollContainerRef}
        searchHighlights={searchHighlights}
        searchRevision={searchRevision}
        {...props}
      />
      <PdfViewportSearchDebugOverlay
        isOpen={isSearchDebugOpen}
        onClose={() => setIsSearchDebugOpen(false)}
        searchHighlights={searchHighlights}
        searchQuery={props.searchQuery}
        searchRequest={props.searchRequest}
        searchStatus={props.searchStatus}
        searchTarget={props.searchTarget}
        searchDebug={searchDebug}
      />
    </>
  );
}

function usePdfSearchDebugState(
  searchQuery: string,
  searchRequest: PdfSearchRequest | null,
  searchStatus: PdfSearchStatus,
  searchTarget: PdfSearchTarget | null,
  searchHighlightCount: number
) {
  return useSearchDebugOverlayState(searchQuery, searchRequest, searchStatus, searchTarget, searchHighlightCount);
}

function PdfDocumentViewportReady(
  props: {
    handleScroll: () => void;
    handleTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
    handleTextLayerRender: (pageNumber: number) => void;
    onSearchDebugChange: (debug: PdfSearchDebugInfo) => void;
    pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
    pageTextByNumberRef: MutableRefObject<Record<number, PdfPageTextEntry | string>>;
    searchHighlights: PdfSearchVisualHighlight[];
    searchRevision: number;
    scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
    onSearchHighlightsChange: (highlights: PdfSearchVisualHighlight[]) => void;
  } & Omit<PdfDocumentViewportProps, 'clearPageJumpRequest' | 'loadError' | 'pageJumpRequest' | 'setVisiblePage'>
) {
  return renderPdfViewportContent(props);
}
