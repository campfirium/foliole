import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { MutableRefObject } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfSearchDebugInfo, PdfSearchRequest, PdfSearchStatus, PdfSearchTarget, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import { PdfViewportSearchDebugOverlay, useSearchDebugOverlayState } from './PdfDocumentViewportDebug';
import {
  PdfDocumentErrorState,
  PdfDocumentViewportContent,
  usePageJumpEffect,
  useViewportTransformAnchor,
  useVisiblePageSync
} from './PdfDocumentViewportParts';
import type { PdfPageTextEntry } from './pdfPageText';

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
    usePdfViewportRuntime(props.clearPageJumpRequest, props.page, props.pageJumpRequest, props.pdfSource, props.rotation, props.setVisiblePage, props.totalPages, props.zoom);
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

function scheduleSearchReflowRefresh(refresh: () => void) {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(refresh);
    });
    return;
  }
  window.setTimeout(refresh, 0);
}

function usePdfViewportRuntime(
  clearPageJumpRequest: (requestId: number) => void,
  page: number,
  pageJumpRequest: PdfJumpRequest | null,
  pdfSource: string,
  rotation: number,
  setVisiblePage: (page: number) => void,
  totalPages: number | null,
  zoom: number
) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const pageTextByNumberRef = useRef<Record<number, PdfPageTextEntry | string>>({});
  const [searchDebug, setSearchDebug] = useState<PdfSearchDebugInfo>({ pages: [] });
  const [searchHighlights, setSearchHighlights] = useState<PdfSearchVisualHighlight[]>([]);
  const [searchRevision, setSearchRevision] = useState(0);

  useEffect(() => {
    pageTextByNumberRef.current = {};
    setSearchDebug({ pages: [] });
    setSearchHighlights([]);
    setSearchRevision((current) => current + 1);
  }, [pdfSource]);

  usePageJumpEffect(pageJumpRequest, pageElementsRef, scrollContainerRef, totalPages, clearPageJumpRequest);
  useViewportTransformAnchor(rotation, scrollContainerRef, zoom);
  const handleScroll = useVisiblePageSync(page, pageElementsRef, scrollContainerRef, setVisiblePage, totalPages);
  const handleTextLayerRender = () => {
    // Text layer can be torn down and rebuilt across repeated searches.
    // Every successful render needs a fresh geometry pass.
    setSearchRevision((current) => current + 1);
    // Trigger one extra pass after paint so highlight geometry is resolved with stable page bounds.
    scheduleSearchReflowRefresh(() => {
      setSearchRevision((current) => current + 1);
    });
  };
  const handleTextContentLoad = (pageNumber: number, text: PdfPageTextEntry) => {
    const current = pageTextByNumberRef.current[pageNumber];
    if (typeof current !== 'string' && current?.text === text.text) {
      return;
    }
    pageTextByNumberRef.current[pageNumber] = text;
    setSearchRevision((current) => current + 1);
  };

  return {
    handleScroll,
    handleTextContentLoad,
    handleTextLayerRender,
    pageElementsRef,
    pageTextByNumberRef,
    searchDebug,
    scrollContainerRef,
    searchHighlights,
    searchRevision,
    setSearchDebug,
    setSearchHighlights
  };
}
