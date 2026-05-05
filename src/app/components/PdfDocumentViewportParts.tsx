import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfSearchDebugInfo, PdfSearchRequest, PdfSearchStatus, PdfSearchTarget, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import { PdfDocumentViewportContentBody } from './PdfDocumentViewportContentBody';
import { usePdfDocumentViewportSearchRuntime } from './PdfDocumentViewportSearchRuntime';
import type { PdfPageDimensions } from './pdfPageDimensions';
import { observePendingPageJump } from './pdfPageJumpEffect';
import type { PdfPageTextEntry } from './pdfPageText';
import { resolveVisiblePage, resolveVisiblePositionY } from './pdfVisiblePageMetrics';

export type PdfPageElementsRef = MutableRefObject<Record<number, HTMLDivElement | null>>;

export function usePageJumpEffect(
  pageJumpRequest: PdfJumpRequest | null,
  pageElementsRef: PdfPageElementsRef,
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>,
  totalPages: number | null,
  onPageJumpHandled: (requestId: number) => void
) {
  useEffect(() => {
    if (!pageJumpRequest) {
      return;
    }
    const container = scrollContainerRef.current;
    if (!container || !totalPages) {
      return;
    }
    const positionY = typeof pageJumpRequest.positionY === 'number' ? Math.max(0, Math.min(1, pageJumpRequest.positionY)) : null;
    return observePendingPageJump({
      container,
      onPageJumpHandled,
      pageElementsRef,
      pageJumpRequest,
      positionY
    });
  }, [onPageJumpHandled, pageJumpRequest, pageElementsRef, scrollContainerRef, totalPages]);
}

export function useVisiblePageSync(
  pageJumpRequest: PdfJumpRequest | null,
  pageElementsRef: PdfPageElementsRef,
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>,
  setVisibleLocation: (page: number, positionY: number) => void,
  totalPages: number | null,
  onVisiblePageChange?: (page: number) => void
) {
  return () => {
    const container = scrollContainerRef.current;
    if (!container || !totalPages || container.offsetParent === null || container.clientHeight === 0 || pageJumpRequest) {
      return;
    }
    const visiblePage = resolveVisiblePage(container, pageElementsRef, totalPages);
    onVisiblePageChange?.(visiblePage);
    setVisibleLocation(visiblePage, resolveVisiblePositionY(container, pageElementsRef.current[visiblePage]));
  };
}

export function useViewportTransformAnchor(
  rotation: number,
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>,
  zoom: number
) {
  const previousZoomRef = useRef(zoom);
  const previousRotationRef = useRef(rotation);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const zoomChanged = previousZoomRef.current !== zoom;
    const rotationChanged = previousRotationRef.current !== rotation;
    if (!zoomChanged && !rotationChanged) {
      return;
    }
    const previousScrollHeight = Math.max(container.scrollHeight, 1);
    const centerRatio = (container.scrollTop + container.clientHeight / 2) / previousScrollHeight;

    const frameId = window.requestAnimationFrame(() => {
      const nextScrollHeight = container.scrollHeight;
      const nextScrollTop = centerRatio * nextScrollHeight - container.clientHeight / 2;
      const maxScrollTop = Math.max(0, nextScrollHeight - container.clientHeight);
      container.scrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop));
    });

    previousZoomRef.current = zoom;
    previousRotationRef.current = rotation;

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [rotation, scrollContainerRef, zoom]);
}
interface PdfDocumentViewportContentProps {
  handleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleScroll: () => void;
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  isToolbarVisible: boolean;
  maxPage: number;
  onClearSearch: () => void;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  onTextLayerRender: (pageNumber: number) => void;
  onSearchStatusChange: (status: PdfSearchStatus) => void;
  onSearchHighlightsChange: (highlights: PdfSearchVisualHighlight[]) => void;
  onSearchDebugChange: (debug: PdfSearchDebugInfo) => void;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchFocusChange: (focused: boolean) => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRequestHandled: (requestId: number) => void;
  onSearchRequest: (direction: 'next' | 'previous') => void;
  onSearchTargetHandled: (targetId: number) => void;
  onSetFitWidth: () => void;
  onSetZoom: (value: number) => void;
  onToolbarActiveChange: (active: boolean) => void;
  onToolbarInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  visiblePage: number;
  page: number;
  pageJumpRequest: PdfJumpRequest | null;
  pageElementsRef: PdfPageElementsRef;
  pageTextByNumberRef: MutableRefObject<Record<number, PdfPageTextEntry | string>>;
  persistedPageCount: number | null;
  persistedPageDimensions: Record<number, PdfPageDimensions>;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  rotation: number;
  searchIndexingHint: string | null;
  searchHighlights: PdfSearchVisualHighlight[];
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  searchQuery: string;
  searchRevision: number;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
  searchStatus: PdfSearchStatus;
  totalPages: number | null;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

export function PdfDocumentViewportContent(props: PdfDocumentViewportContentProps) {
  usePdfDocumentViewportSearchRuntime(resolvePdfSearchRuntimeArgs(props));
  return renderPdfViewportContentBody(resolveViewportContentBodyProps(props));
}

function renderPdfViewportContentBody(
  props: Omit<
    PdfDocumentViewportContentProps,
    | 'onSearchDebugChange'
    | 'onSearchHighlightsChange'
    | 'onSearchRequestHandled'
    | 'onSearchStatusChange'
    | 'onSearchTargetHandled'
    | 'pageTextByNumberRef'
    | 'searchRequest'
    | 'searchRevision'
    | 'searchTarget'
  >
) {
  return <PdfDocumentViewportContentBody {...props} />;
}

function resolvePdfSearchRuntimeArgs(props: PdfDocumentViewportContentProps) {
  return {
    onSearchHighlightsChange: props.onSearchHighlightsChange,
    onSearchDebugChange: props.onSearchDebugChange,
    onSearchRequestHandled: props.onSearchRequestHandled,
    onSearchStatusChange: props.onSearchStatusChange,
    onSearchTargetHandled: props.onSearchTargetHandled,
    pageElementsRef: props.pageElementsRef,
    pageTextByNumberRef: props.pageTextByNumberRef,
    scrollContainerRef: props.scrollContainerRef,
    searchQuery: props.searchQuery,
    searchRequest: props.searchRequest,
    searchRevision: props.searchRevision,
    searchTarget: props.searchTarget,
    totalPages: props.totalPages
  } as const;
}

function resolveViewportContentBodyProps(
  props: PdfDocumentViewportContentProps
): Omit<
  PdfDocumentViewportContentProps,
  | 'onSearchDebugChange'
  | 'onSearchHighlightsChange'
  | 'onSearchRequestHandled'
  | 'onSearchStatusChange'
  | 'onSearchTargetHandled'
  | 'pageTextByNumberRef'
  | 'searchRequest'
  | 'searchRevision'
  | 'searchTarget'
> {
  return {
    handleContextMenu: props.handleContextMenu,
    handleScroll: props.handleScroll,
    highlightLocators: props.highlightLocators,
    isToolbarVisible: props.isToolbarVisible,
    maxPage: props.maxPage,
    onClearSearch: props.onClearSearch,
    onLoadError: props.onLoadError,
    onLoadSuccess: props.onLoadSuccess,
    onTextContentLoad: props.onTextContentLoad,
    onNextPage: props.onNextPage,
    onPageChange: props.onPageChange,
    onPreviousPage: props.onPreviousPage,
    onRotateClockwise: props.onRotateClockwise,
    onSearchFocusChange: props.onSearchFocusChange,
    onSearchQueryChange: props.onSearchQueryChange,
    onSearchRequest: props.onSearchRequest,
    onSetFitWidth: props.onSetFitWidth,
    onSetZoom: props.onSetZoom,
    onToolbarActiveChange: props.onToolbarActiveChange,
    onTextLayerRender: props.onTextLayerRender,
    onToolbarInteraction: props.onToolbarInteraction,
    onZoomIn: props.onZoomIn,
    onZoomOut: props.onZoomOut,
    visiblePage: props.visiblePage,
    page: props.page,
    pageJumpRequest: props.pageJumpRequest,
    pageElementsRef: props.pageElementsRef,
    persistedPageCount: props.persistedPageCount,
    persistedPageDimensions: props.persistedPageDimensions,
    pdfSelectionLocator: props.pdfSelectionLocator,
    pdfSource: props.pdfSource,
    rotation: props.rotation,
    searchIndexingHint: props.searchIndexingHint,
    searchHighlights: props.searchHighlights,
    scrollContainerRef: props.scrollContainerRef,
    searchQuery: props.searchQuery,
    searchStatus: props.searchStatus,
    totalPages: props.totalPages,
    zoomMode: props.zoomMode,
    zoom: props.zoom
  };
}
