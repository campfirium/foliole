import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Document, Page } from 'react-pdf';

const PDF_PAGE_MIN = 1;

interface PdfDocumentViewportProps {
  loadError: string | null;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  page: number;
  pageJumpRequest: number | null;
  pdfSource: string;
  setPageJumpRequest: (page: number | null) => void;
  setVisiblePage: (page: number) => void;
  totalPages: number | null;
  zoom: number;
}

function usePageJumpEffect(
  pageJumpRequest: number | null,
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>,
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
  }, [pageJumpRequest, setPageJumpRequest]);
}

function resolveVisiblePage(
  container: HTMLDivElement,
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>,
  totalPages: number
) {
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

function PdfDocumentErrorState({ loadError }: { loadError: string }) {
  return (
    <div className="flex min-h-[360px] w-full items-center justify-center rounded-md bg-bg-panel/55 p-6">
      <p className="text-sm text-foreground/70" data-testid="pdf-document-load-error">
        {loadError}
      </p>
    </div>
  );
}

function PdfDocumentPages({
  pageElementsRef,
  totalPages,
  zoom
}: {
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>;
  totalPages: number | null;
  zoom: number;
}) {
  if (!totalPages) {
    return null;
  }
  return Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + PDF_PAGE_MIN;
    return (
      <div
        className="w-full px-4"
        data-testid="pdf-document-page-shell"
        key={pageNumber}
        ref={(element) => {
          pageElementsRef.current[pageNumber] = element;
        }}
      >
        <Page
          className="overflow-hidden rounded-sm bg-bg-panel shadow-sm"
          data-testid="pdf-document-page"
          pageNumber={pageNumber}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          scale={zoom / 100}
        />
      </div>
    );
  });
}

export function PdfDocumentViewport({
  loadError,
  onLoadError,
  onLoadSuccess,
  page,
  pageJumpRequest,
  pdfSource,
  setPageJumpRequest,
  setVisiblePage,
  totalPages,
  zoom
}: PdfDocumentViewportProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  usePageJumpEffect(pageJumpRequest, pageElementsRef, scrollContainerRef, setPageJumpRequest);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || !totalPages) {
      return;
    }
    const visiblePage = resolveVisiblePage(container, pageElementsRef, totalPages);
    if (visiblePage !== page) {
      setVisiblePage(visiblePage);
    }
  };

  if (loadError) {
    return <PdfDocumentErrorState loadError={loadError} />;
  }

  return (
    <div
      className="app-scrollbar flex min-h-0 flex-1 justify-center overflow-y-auto overflow-x-hidden px-2 pb-5 pt-16"
      onScroll={handleScroll}
      ref={scrollContainerRef}
    >
      <Document
        className="mx-auto flex w-full max-w-[var(--document-max-width)] flex-col items-center gap-4"
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
        <PdfDocumentPages pageElementsRef={pageElementsRef} totalPages={totalPages} zoom={zoom} />
      </Document>
    </div>
  );
}
