import { Document, Page } from 'react-pdf';

import type { PdfSearchStatus } from './PdfDocumentSearch';
import { PdfDocumentToolbar } from './PdfDocumentToolbar';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { renderPdfOverlayMarker, renderPdfOverlayRects, resolvePdfOverlayMarkerSize } from './pdfOverlayRender';

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
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
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
        pdfSelectionLocator={props.pdfSelectionLocator}
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

function PdfDocumentPages({
  highlightLocators,
  onTextLayerRender,
  pageElementsRef,
  pdfSelectionLocator,
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
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
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
      pdfSelectionLocator,
      rotation,
      zoom
    });
  });
}

function renderStoredHighlights(
  pageHighlights: Array<{
    id: string;
    rects?: Array<{ height: number; width: number; x: number; y: number }>;
    x: number | null;
    y: number | null;
  }>,
  markerSize: number
) {
  return pageHighlights.map((locator) => {
    const highlightRects = renderPdfOverlayRects(locator);
    return highlightRects ?? renderPdfOverlayMarker(locator, markerSize);
  });
}

function renderSelectionOverlay(
  selectionLocator: { id: string; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | null,
  markerSize: number
) {
  if (!selectionLocator) {
    return null;
  }
  return (
    renderPdfOverlayRects(
      selectionLocator,
      'pointer-events-none absolute z-20 rounded-[3px] bg-accent/30 ring-1 ring-accent/45',
      'pdf-selection-rect'
    ) ??
    renderPdfOverlayMarker(
      selectionLocator,
      markerSize,
      'pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/30 shadow-sm ring-1 ring-accent/60',
      'pdf-selection-marker'
    )
  );
}

function renderPdfPage({
  highlightLocators,
  onTextLayerRender,
  pageElementsRef,
  pageNumber,
  pdfSelectionLocator,
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
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  rotation: number;
  zoom: number;
}) {
  const pageHighlights = resolvePageHighlightLocators(highlightLocators, pageNumber);
  const markerSize = resolvePdfOverlayMarkerSize(zoom);
  const selectionLocator = pdfSelectionLocator?.page === pageNumber ? { ...pdfSelectionLocator, id: 'pdf-selection-overlay' } : null;
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
        {renderStoredHighlights(pageHighlights, markerSize)}
        {renderSelectionOverlay(selectionLocator, markerSize)}
      </div>
    </div>
  );
}
