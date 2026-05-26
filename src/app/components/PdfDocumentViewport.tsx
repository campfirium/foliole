import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import { PdfDocumentErrorState } from './PdfDocumentErrorState';
import type { PdfSearchDebugInfo, PdfSearchRequest, PdfSearchStatus, PdfSearchTarget, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import { PdfDocumentViewportContent } from './PdfDocumentViewportParts';
import type { PdfPageDimensions } from './pdfPageDimensions';
import type { PdfPageTextEntry } from './pdfPageText';
import { usePdfViewportRuntime } from './pdfViewportRuntime';
import { usePdfToolbarVisibility } from './usePdfToolbarVisibility';

interface PdfDocumentViewportProps {
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  loadError: string | null;
  maxPage: number;
  onNextPage: () => void;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onRetryLoad: () => void;
  onSearchStatusChange: (status: PdfSearchStatus) => void;
  onClearSearch: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRequest: (direction: 'next' | 'previous') => void;
  onSearchRequestHandled: (requestId: number) => void;
  onSearchTargetHandled: (targetId: number) => void;
  onSetFitWidth: () => void;
  onSetZoom: (value: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  visiblePage: number;
  page: number;
  pageJumpRequest: PdfJumpRequest | null;
  persistedPageCount: number | null;
  persistedPageDimensions: Record<number, PdfPageDimensions>;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  rotation: number;
  searchIndexingHint: string | null;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
  searchStatus: PdfSearchStatus;
  clearPageJumpRequest: (requestId: number) => void;
  setVisibleLocation: (page: number, positionY: number) => void;
  totalPages: number | null;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

function renderPdfViewportContent(args: {
  handleTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  handleTextLayerRender: (pageNumber: number) => void;
  handleScroll: () => void;
  isToolbarVisible: boolean;
  onSearchDebugChange: (debug: PdfSearchDebugInfo) => void;
  onSearchHighlightsChange: (highlights: PdfSearchVisualHighlight[]) => void;
  onSearchFocusChange: (focused: boolean) => void;
  onToolbarActiveChange: (active: boolean) => void;
  onToolbarInteraction: () => void;
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
  pageTextByNumberRef: MutableRefObject<Record<number, PdfPageTextEntry | string>>;
  searchHighlights: PdfSearchVisualHighlight[];
  searchRevision: number;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
} & Omit<PdfDocumentViewportProps, 'clearPageJumpRequest' | 'loadError' | 'setVisibleLocation'>) {
  return <PdfDocumentViewportContent {...resolveViewportContentProps(args)} />;
}

function resolveViewportContentProps(
  args: {
    handleTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
    handleTextLayerRender: (pageNumber: number) => void;
    handleScroll: () => void;
    isToolbarVisible: boolean;
    onSearchDebugChange: (debug: PdfSearchDebugInfo) => void;
    onSearchHighlightsChange: (highlights: PdfSearchVisualHighlight[]) => void;
    onSearchFocusChange: (focused: boolean) => void;
    onToolbarActiveChange: (active: boolean) => void;
    onToolbarInteraction: () => void;
    pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
    pageTextByNumberRef: MutableRefObject<Record<number, PdfPageTextEntry | string>>;
    searchHighlights: PdfSearchVisualHighlight[];
    searchRevision: number;
    scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  } & Omit<PdfDocumentViewportProps, 'clearPageJumpRequest' | 'loadError' | 'setVisibleLocation'>
) {
  return {
    handleContextMenu: args.onContextMenu,
    handleScroll: args.handleScroll,
    highlightLocators: args.highlightLocators,
    isToolbarVisible: args.isToolbarVisible,
    maxPage: args.maxPage,
    ...resolveViewportActionProps(args),
    onTextContentLoad: args.handleTextContentLoad,
    onTextLayerRender: args.handleTextLayerRender,
    onToolbarActiveChange: args.onToolbarActiveChange,
    onToolbarInteraction: args.onToolbarInteraction,
    visiblePage: args.visiblePage,
    page: args.page,
    pageJumpRequest: args.pageJumpRequest,
    persistedPageCount: args.persistedPageCount,
    pageElementsRef: args.pageElementsRef,
    pageTextByNumberRef: args.pageTextByNumberRef,
    persistedPageDimensions: args.persistedPageDimensions,
    pdfSelectionLocator: args.pdfSelectionLocator,
    pdfSource: args.pdfSource,
    rotation: args.rotation,
    scrollContainerRef: args.scrollContainerRef,
    searchHighlights: args.searchHighlights,
    searchIndexingHint: args.searchIndexingHint,
    searchQuery: args.searchQuery,
    searchRequest: args.searchRequest,
    searchRevision: args.searchRevision,
    searchStatus: args.searchStatus,
    searchTarget: args.searchTarget,
    totalPages: args.totalPages,
    zoomMode: args.zoomMode,
    zoom: args.zoom
  };
}

function resolveViewportActionProps(args: {
  onClearSearch: () => void;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchDebugChange: (debug: PdfSearchDebugInfo) => void;
  onSearchFocusChange: (focused: boolean) => void;
  onSearchHighlightsChange: (highlights: PdfSearchVisualHighlight[]) => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRequest: (direction: 'next' | 'previous') => void;
  onSearchRequestHandled: (requestId: number) => void;
  onSearchStatusChange: (status: PdfSearchStatus) => void;
  onSearchTargetHandled: (targetId: number) => void;
  onSetFitWidth: () => void;
  onSetZoom: (value: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return {
    onClearSearch: args.onClearSearch,
    onLoadError: args.onLoadError,
    onLoadSuccess: args.onLoadSuccess,
    onNextPage: args.onNextPage,
    onPageChange: args.onPageChange,
    onPreviousPage: args.onPreviousPage,
    onRotateClockwise: args.onRotateClockwise,
    onSearchDebugChange: args.onSearchDebugChange,
    onSearchFocusChange: args.onSearchFocusChange,
    onSearchHighlightsChange: args.onSearchHighlightsChange,
    onSearchQueryChange: args.onSearchQueryChange,
    onSearchRequest: args.onSearchRequest,
    onSearchRequestHandled: args.onSearchRequestHandled,
    onSearchStatusChange: args.onSearchStatusChange,
    onSearchTargetHandled: args.onSearchTargetHandled,
    onSetFitWidth: args.onSetFitWidth,
    onSetZoom: args.onSetZoom,
    onZoomIn: args.onZoomIn,
    onZoomOut: args.onZoomOut
  };
}

export function PdfDocumentViewport(props: PdfDocumentViewportProps) {
  const { handleScroll, handleTextContentLoad, handleTextLayerRender, pageElementsRef, pageTextByNumberRef, scrollContainerRef, searchHighlights, searchRevision, setSearchDebug, setSearchHighlights, visiblePage } =
    usePdfViewportRuntime({
      clearPageJumpRequest: props.clearPageJumpRequest,
      page: props.page,
      pageJumpRequest: props.pageJumpRequest,
      pdfSource: props.pdfSource,
      rotation: props.rotation,
      searchQuery: props.searchQuery,
      searchRequest: props.searchRequest,
      searchTarget: props.searchTarget,
      setVisibleLocation: props.setVisibleLocation,
      totalPages: props.totalPages,
      zoom: props.zoom
    });
  const { handleSearchFocusChange, handleToolbarActiveChange, handleToolbarInteraction, handleToolbarScroll, isToolbarVisible } =
    usePdfToolbarVisibility(props.searchQuery, scrollContainerRef, handleScroll);

  if (props.loadError) {
    return <PdfDocumentErrorState loadError={props.loadError} onRetry={props.onRetryLoad} />;
  }

  return (
    <>
      <PdfDocumentViewportReady
        handleScroll={handleToolbarScroll}
        handleTextContentLoad={handleTextContentLoad}
        handleTextLayerRender={handleTextLayerRender}
        isToolbarVisible={isToolbarVisible}
        onSearchHighlightsChange={setSearchHighlights}
        onSearchDebugChange={setSearchDebug}
        onSearchFocusChange={handleSearchFocusChange}
        onToolbarActiveChange={handleToolbarActiveChange}
        onToolbarInteraction={handleToolbarInteraction}
        pageElementsRef={pageElementsRef}
        pageTextByNumberRef={pageTextByNumberRef}
        scrollContainerRef={scrollContainerRef}
        searchHighlights={searchHighlights}
        searchRevision={searchRevision}
        {...props}
        visiblePage={visiblePage}
      />
    </>
  );
}

function PdfDocumentViewportReady(
  props: {
    handleScroll: () => void;
    handleTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
    handleTextLayerRender: (pageNumber: number) => void;
    isToolbarVisible: boolean;
    onClearSearch: () => void;
    onSearchDebugChange: (debug: PdfSearchDebugInfo) => void;
    pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
    pageTextByNumberRef: MutableRefObject<Record<number, PdfPageTextEntry | string>>;
    persistedPageCount: number | null;
    persistedPageDimensions: Record<number, PdfPageDimensions>;
    searchHighlights: PdfSearchVisualHighlight[];
    searchRevision: number;
    scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
    onSearchHighlightsChange: (highlights: PdfSearchVisualHighlight[]) => void;
    onSearchFocusChange: (focused: boolean) => void;
    onToolbarActiveChange: (active: boolean) => void;
    onToolbarInteraction: () => void;
    visiblePage: number;
  } & Omit<PdfDocumentViewportProps, 'clearPageJumpRequest' | 'loadError' | 'setVisibleLocation'>
) {
  return renderPdfViewportContent(props);
}
