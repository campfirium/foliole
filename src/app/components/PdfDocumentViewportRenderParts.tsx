import { Document, Page } from 'react-pdf';

import type { PdfSearchStatus } from './PdfDocumentSearch';
import { PdfDocumentToolbar } from './PdfDocumentToolbar';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';

const PDF_PAGE_MIN = 1;

interface PdfViewportToolbarProps {
  maxPage: number;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRequest: (direction: 'next' | 'previous') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  rotation: number;
  searchQuery: string;
  searchStatus: PdfSearchStatus;
  zoom: number;
}

export function PdfViewportToolbar(props: PdfViewportToolbarProps) {
  return (
    <PdfDocumentToolbar
      maxPage={props.maxPage}
      onFindNext={() => props.onSearchRequest('next')}
      onFindPrevious={() => props.onSearchRequest('previous')}
      onNextPage={props.onNextPage}
      onPageChange={props.onPageChange}
      onPreviousPage={props.onPreviousPage}
      onRotateClockwise={props.onRotateClockwise}
      onSearchQueryChange={props.onSearchQueryChange}
      onZoomIn={props.onZoomIn}
      onZoomOut={props.onZoomOut}
      page={props.page}
      rotation={props.rotation}
      searchQuery={props.searchQuery}
      searchStatus={props.searchStatus}
      zoom={props.zoom}
    />
  );
}

interface PdfViewportDocumentProps {
  highlightLocators: Array<{
    id: string;
    page: number;
    rects?: Array<{ height: number; width: number; x: number; y: number }>;
    x: number | null;
    y: number | null;
  }>;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onTextLayerRender: (pageNumber: number) => void;
  pageElementsRef: PdfPageElementsRef;
  pdfSource: string;
  rotation: number;
  totalPages: number | null;
  zoom: number;
}

export function PdfViewportDocument(props: PdfViewportDocumentProps) {
  return (
    <Document
      className="mx-auto flex w-full max-w-none flex-col items-center gap-4"
      data-testid="pdf-document-view"
      file={props.pdfSource}
      loading={
        <div className="flex min-h-[360px] items-center justify-center rounded-md bg-bg-panel/55">
          <p className="text-sm text-foreground/70">Loading PDF...</p>
        </div>
      }
      noData={<p className="text-sm text-foreground/70">No PDF file selected.</p>}
      onLoadError={(error) => props.onLoadError(error.message || 'Failed to load PDF document.')}
      onLoadSuccess={({ numPages }: { numPages: number }) => props.onLoadSuccess(numPages)}
    >
      <PdfDocumentPages
        highlightLocators={props.highlightLocators}
        onTextLayerRender={props.onTextLayerRender}
        pageElementsRef={props.pageElementsRef}
        rotation={props.rotation}
        totalPages={props.totalPages}
        zoom={props.zoom}
      />
    </Document>
  );
}

function stripTextLayerInlineFonts(page: HTMLDivElement | null) {
  if (!page) {
    return;
  }
  const spans = page.querySelectorAll<HTMLSpanElement>('.textLayer span');
  for (const span of spans) {
    span.style.fontFamily = '';
  }
}

function resolvePageHighlightLocators(
  highlightLocators: Array<{
    id: string;
    page: number;
    rects?: Array<{ height: number; width: number; x: number; y: number }>;
    x: number | null;
    y: number | null;
  }>,
  page: number
) {
  return highlightLocators.filter((locator) => locator.page === page);
}

function resolveMarkerSize(zoom: number) {
  return Math.max(10, Math.round((zoom / 100) * 12));
}

function renderPageHighlightMarker(locator: { id: string; x: number | null; y: number | null }, markerSize: number) {
  if (typeof locator.x !== 'number' || typeof locator.y !== 'number') {
    return null;
  }
  const markerTop = `${Math.max(0, Math.min(100, locator.y * 100))}%`;
  const markerLeft = `${Math.max(0, Math.min(100, locator.x * 100))}%`;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/50 shadow-sm ring-1 ring-accent/30"
      data-testid="pdf-highlight-marker"
      key={locator.id}
      style={{ height: markerSize, left: markerLeft, top: markerTop, width: markerSize }}
    />
  );
}

function renderHighlightRects(locator: {
  id: string;
  rects?: Array<{ height: number; width: number; x: number; y: number }>;
  x: number | null;
  y: number | null;
}) {
  const rects = Array.isArray(locator.rects) ? locator.rects : [];
  if (rects.length === 0) {
    return null;
  }
  return rects.map((rect, index) => (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute z-10 rounded-[2px] bg-accent/35 ring-1 ring-accent/20"
      data-testid="pdf-highlight-rect"
      key={`${locator.id}:${index}`}
      style={{
        height: `${Math.max(0, Math.min(100, rect.height * 100))}%`,
        left: `${Math.max(0, Math.min(100, rect.x * 100))}%`,
        top: `${Math.max(0, Math.min(100, rect.y * 100))}%`,
        width: `${Math.max(0, Math.min(100, rect.width * 100))}%`
      }}
    />
  ));
}

function PdfDocumentPages({
  highlightLocators,
  onTextLayerRender,
  pageElementsRef,
  rotation,
  totalPages,
  zoom
}: {
  highlightLocators: Array<{
    id: string;
    page: number;
    rects?: Array<{ height: number; width: number; x: number; y: number }>;
    x: number | null;
    y: number | null;
  }>;
  onTextLayerRender: (pageNumber: number) => void;
  pageElementsRef: PdfPageElementsRef;
  rotation: number;
  totalPages: number | null;
  zoom: number;
}) {
  if (!totalPages) {
    return null;
  }
  return Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + PDF_PAGE_MIN;
    return renderPdfPage({
      highlightLocators,
      onTextLayerRender,
      pageElementsRef,
      pageNumber,
      rotation,
      zoom
    });
  });
}

function renderPdfPage({
  highlightLocators,
  onTextLayerRender,
  pageElementsRef,
  pageNumber,
  rotation,
  zoom
}: {
  highlightLocators: Array<{
    id: string;
    page: number;
    rects?: Array<{ height: number; width: number; x: number; y: number }>;
    x: number | null;
    y: number | null;
  }>;
  onTextLayerRender: (pageNumber: number) => void;
  pageElementsRef: PdfPageElementsRef;
  pageNumber: number;
  rotation: number;
  zoom: number;
}) {
  const pageHighlights = resolvePageHighlightLocators(highlightLocators, pageNumber);
  const markerSize = resolveMarkerSize(zoom);
  return (
    <div
      className="relative flex w-full justify-center px-4"
      data-pdf-page-number={pageNumber}
      data-testid="pdf-document-page-shell"
      key={pageNumber}
      ref={(element) => {
        pageElementsRef.current[pageNumber] = element;
      }}
    >
      <div className="relative inline-block">
        <Page
          className="mx-auto overflow-hidden rounded-sm bg-bg-panel shadow-sm"
          data-testid="pdf-document-page"
          onRenderTextLayerSuccess={() => {
            stripTextLayerInlineFonts(pageElementsRef.current[pageNumber]);
            onTextLayerRender(pageNumber);
          }}
          pageNumber={pageNumber}
          renderAnnotationLayer
          renderTextLayer
          rotate={rotation}
          scale={zoom / 100}
        />
        {pageHighlights.map((locator) => {
          const highlightRects = renderHighlightRects(locator);
          return highlightRects ?? renderPageHighlightMarker(locator, markerSize);
        })}
      </div>
    </div>
  );
}
