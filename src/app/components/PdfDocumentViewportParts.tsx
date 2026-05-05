import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfSearchRequest, PdfSearchStatus } from './PdfDocumentSearch';
import { usePdfSearchEffect } from './PdfDocumentSearch';
import { PdfDocumentViewportContentBody } from './PdfDocumentViewportContentBody';

const PDF_PAGE_MIN = 1;

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
    const target = pageElementsRef.current[pageJumpRequest.page];
    if (!container || !target) {
      return;
    }
    const positionY = typeof pageJumpRequest.positionY === 'number' ? Math.max(0, Math.min(1, pageJumpRequest.positionY)) : null;
    const top =
      positionY === null
        ? Math.max(0, target.offsetTop - 8)
        : Math.max(0, target.offsetTop + target.clientHeight * positionY - container.clientHeight * 0.35);
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ behavior: 'smooth', top });
    } else {
      container.scrollTop = top;
    }
    onPageJumpHandled(pageJumpRequest.id);
  }, [onPageJumpHandled, pageJumpRequest, pageElementsRef, scrollContainerRef, totalPages]);
}

function resolveVisiblePage(container: HTMLDivElement, pageElementsRef: PdfPageElementsRef, totalPages: number) {
  const anchor = container.scrollTop + container.clientHeight * 0.35;
  let visiblePage = PDF_PAGE_MIN;
  for (let index = PDF_PAGE_MIN; index <= totalPages; index += 1) {
    const element = pageElementsRef.current[index];
    if (!element) {
      continue;
    }
    if (element.offsetTop <= anchor) {
      visiblePage = index;
    } else {
      break;
    }
  }
  return visiblePage;
}

export function useVisiblePageSync(
  page: number,
  pageElementsRef: PdfPageElementsRef,
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>,
  setVisiblePage: (page: number) => void,
  totalPages: number | null
) {
  return () => {
    const container = scrollContainerRef.current;
    if (!container || !totalPages) {
      return;
    }
    const visiblePage = resolveVisiblePage(container, pageElementsRef, totalPages);
    if (visiblePage !== page) {
      setVisiblePage(visiblePage);
    }
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
export function PdfDocumentErrorState({ loadError }: { loadError: string }) {
  return (
    <div className="flex min-h-[360px] w-full items-center justify-center rounded-md bg-bg-panel/55 p-6">
      <p className="text-sm text-foreground/70" data-testid="pdf-document-load-error">
        {loadError}
      </p>
    </div>
  );
}

interface PdfDocumentViewportContentProps {
  handleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleScroll: () => void;
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  maxPage: number;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onTextContentLoad: (pageNumber: number, text: string) => void;
  onTextLayerRender: (pageNumber: number) => void;
  onSearchStatusChange: (status: PdfSearchStatus) => void;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRequest: (direction: 'next' | 'previous') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  pageElementsRef: PdfPageElementsRef;
  pageTextByNumberRef: MutableRefObject<Record<number, string>>;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  rotation: number;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  searchQuery: string;
  searchRevision: number;
  searchRequest: PdfSearchRequest | null;
  searchStatus: PdfSearchStatus;
  totalPages: number | null;
  zoom: number;
}

function usePdfSearchRuntime({
  onSearchStatusChange,
  pageElementsRef,
  pageTextByNumberRef,
  scrollContainerRef,
  searchQuery,
  searchRevision,
  searchRequest,
  totalPages
}: Pick<
  PdfDocumentViewportContentProps,
  'onSearchStatusChange' | 'pageElementsRef' | 'pageTextByNumberRef' | 'scrollContainerRef' | 'searchQuery' | 'searchRequest' | 'searchRevision' | 'totalPages'
>) {
  usePdfSearchEffect({ onSearchStatusChange, pageElementsRef, pageTextByNumberRef, scrollContainerRef, searchQuery, searchRequest, searchRevision, totalPages });
}

export function PdfDocumentViewportContent(props: PdfDocumentViewportContentProps) {
  usePdfSearchRuntime(resolvePdfSearchRuntimeArgs(props));
  return renderPdfViewportContentBody(resolveViewportContentBodyProps(props));
}

function renderPdfViewportContentBody(props: Omit<PdfDocumentViewportContentProps, 'onSearchStatusChange' | 'pageTextByNumberRef' | 'searchRequest' | 'searchRevision'>) {
  return <PdfDocumentViewportContentBody {...props} />;
}

function resolvePdfSearchRuntimeArgs(props: PdfDocumentViewportContentProps) {
  return {
    onSearchStatusChange: props.onSearchStatusChange,
    pageElementsRef: props.pageElementsRef,
    pageTextByNumberRef: props.pageTextByNumberRef,
    scrollContainerRef: props.scrollContainerRef,
    searchQuery: props.searchQuery,
    searchRequest: props.searchRequest,
    searchRevision: props.searchRevision,
    totalPages: props.totalPages
  } as const;
}

function resolveViewportContentBodyProps(
  props: PdfDocumentViewportContentProps
): Omit<PdfDocumentViewportContentProps, 'onSearchStatusChange' | 'pageTextByNumberRef' | 'searchRequest' | 'searchRevision'> {
  return {
    handleContextMenu: props.handleContextMenu,
    handleScroll: props.handleScroll,
    highlightLocators: props.highlightLocators,
    maxPage: props.maxPage,
    onLoadError: props.onLoadError,
    onLoadSuccess: props.onLoadSuccess,
    onTextContentLoad: props.onTextContentLoad,
    onNextPage: props.onNextPage,
    onPageChange: props.onPageChange,
    onPreviousPage: props.onPreviousPage,
    onRotateClockwise: props.onRotateClockwise,
    onSearchQueryChange: props.onSearchQueryChange,
    onSearchRequest: props.onSearchRequest,
    onTextLayerRender: props.onTextLayerRender,
    onZoomIn: props.onZoomIn,
    onZoomOut: props.onZoomOut,
    page: props.page,
    pageElementsRef: props.pageElementsRef,
    pdfSelectionLocator: props.pdfSelectionLocator,
    pdfSource: props.pdfSource,
    rotation: props.rotation,
    scrollContainerRef: props.scrollContainerRef,
    searchQuery: props.searchQuery,
    searchStatus: props.searchStatus,
    totalPages: props.totalPages,
    zoom: props.zoom
  };
}
