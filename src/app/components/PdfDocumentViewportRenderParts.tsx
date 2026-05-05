import { Document } from 'react-pdf';

import { renderPdfPage } from './PdfDocumentPageRender';
import type { PdfSearchStatus, PdfSearchVisualHighlight } from './PdfDocumentSearch';
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
  searchIndexingHint: string | null;
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
      searchIndexingHint={props.searchIndexingHint}
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
  onTextContentLoad: (pageNumber: number, text: string) => void;
  onTextLayerRender: (pageNumber: number) => void;
  pageElementsRef: PdfPageElementsRef;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  rotation: number;
  searchHighlights: PdfSearchVisualHighlight[];
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
        onTextContentLoad={props.onTextContentLoad}
        onTextLayerRender={props.onTextLayerRender}
        pageElementsRef={props.pageElementsRef}
        pdfSelectionLocator={props.pdfSelectionLocator}
        rotation={props.rotation}
        searchHighlights={props.searchHighlights}
        totalPages={props.totalPages}
        zoom={props.zoom}
      />
    </Document>
  );
}

function PdfDocumentPages({
  highlightLocators,
  onTextContentLoad,
  onTextLayerRender,
  pageElementsRef,
  pdfSelectionLocator,
  rotation,
  searchHighlights,
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
  onTextContentLoad: (pageNumber: number, text: string) => void;
  onTextLayerRender: (pageNumber: number) => void;
  pageElementsRef: PdfPageElementsRef;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  rotation: number;
  searchHighlights: PdfSearchVisualHighlight[];
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
      onTextContentLoad,
      onTextLayerRender,
      pageElementsRef,
      pageNumber,
      pdfSelectionLocator,
      rotation,
      searchHighlights,
      zoom
    });
  });
}
