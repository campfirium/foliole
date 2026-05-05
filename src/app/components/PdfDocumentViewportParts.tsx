import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Document, Page } from 'react-pdf';

import { PdfDocumentToolbar } from './PdfDocumentToolbar';

const PDF_PAGE_MIN = 1;

export type PdfPageElementsRef = MutableRefObject<Record<number, HTMLDivElement | null>>;

export function usePageJumpEffect(
  pageJumpRequest: number | null,
  pageElementsRef: PdfPageElementsRef,
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>,
  setPageJumpRequest: (page: number | null) => void
) {
  useEffect(() => {
    if (!pageJumpRequest) {
      return;
    }
    const container = scrollContainerRef.current;
    const target = pageElementsRef.current[pageJumpRequest];
    if (!container || !target) {
      return;
    }
    const top = Math.max(0, target.offsetTop - 8);
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ behavior: 'smooth', top });
    } else {
      container.scrollTop = top;
    }
    setPageJumpRequest(null);
  }, [pageJumpRequest, pageElementsRef, scrollContainerRef, setPageJumpRequest]);
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

function PdfDocumentPages({ pageElementsRef, rotation, totalPages, zoom }: { pageElementsRef: PdfPageElementsRef; rotation: number; totalPages: number | null; zoom: number }) {
  if (!totalPages) {
    return null;
  }
  return Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + PDF_PAGE_MIN;
    return (
      <div
        className="flex w-full justify-center px-4"
        data-testid="pdf-document-page-shell"
        key={pageNumber}
        ref={(element) => {
          pageElementsRef.current[pageNumber] = element;
        }}
      >
        <Page
          className="mx-auto overflow-hidden rounded-sm bg-bg-panel shadow-sm"
          data-testid="pdf-document-page"
          pageNumber={pageNumber}
          renderAnnotationLayer
          renderTextLayer
          rotate={rotation}
          scale={zoom / 100}
        />
      </div>
    );
  });
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
  maxPage: number;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  pageElementsRef: PdfPageElementsRef;
  pdfSource: string;
  rotation: number;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  totalPages: number | null;
  zoom: number;
}

export function PdfDocumentViewportContent({
  handleContextMenu,
  handleScroll,
  maxPage,
  onLoadError,
  onLoadSuccess,
  onNextPage,
  onPageChange,
  onPreviousPage,
  onRotateClockwise,
  onZoomIn,
  onZoomOut,
  page,
  pageElementsRef,
  pdfSource,
  rotation,
  scrollContainerRef,
  totalPages,
  zoom
}: PdfDocumentViewportContentProps) {
  return (
    <div
      className="app-scrollbar flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-auto px-2 pb-5"
      onContextMenu={handleContextMenu}
      onScroll={handleScroll}
      ref={scrollContainerRef}
    >
      <PdfDocumentToolbar
        maxPage={maxPage}
        onNextPage={onNextPage}
        onPageChange={onPageChange}
        onPreviousPage={onPreviousPage}
        onRotateClockwise={onRotateClockwise}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        page={page}
        rotation={rotation}
        zoom={zoom}
      />
      <Document
        className="mx-auto flex w-full max-w-none flex-col items-center gap-4"
        data-testid="pdf-document-view"
        file={pdfSource}
        loading={
          <div className="flex min-h-[360px] items-center justify-center rounded-md bg-bg-panel/55">
            <p className="text-sm text-foreground/70">Loading PDF...</p>
          </div>
        }
        noData={<p className="text-sm text-foreground/70">No PDF file selected.</p>}
        onLoadError={(error) => onLoadError(error.message || 'Failed to load PDF document.')}
        onLoadSuccess={({ numPages }: { numPages: number }) => onLoadSuccess(numPages)}
      >
        <PdfDocumentPages pageElementsRef={pageElementsRef} rotation={rotation} totalPages={totalPages} zoom={zoom} />
      </Document>
    </div>
  );
}
