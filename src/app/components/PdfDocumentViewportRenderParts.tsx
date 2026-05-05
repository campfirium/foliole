import { Document } from 'react-pdf';

import { renderPdfPage } from './PdfDocumentPageRender';
import type { PdfSearchStatus, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import { PdfDocumentToolbar } from './PdfDocumentToolbar';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import type { PdfPageTextEntry } from './pdfPageText';

const PDF_PAGE_MIN = 1;

interface PdfViewportToolbarProps {
  isVisible: boolean;
  maxPage: number;
  onClearSearch: () => void;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchFocusChange: (focused: boolean) => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRequest: (direction: 'next' | 'previous') => void;
  onSetFitWidth: () => void;
  onSetZoom: (value: number) => void;
  onToolbarActiveChange: (active: boolean) => void;
  onToolbarInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  searchIndexingHint: string | null;
  searchQuery: string;
  searchStatus: PdfSearchStatus;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

export function PdfViewportToolbar(props: PdfViewportToolbarProps) {
  return (
    <PdfDocumentToolbar
      isVisible={props.isVisible}
      maxPage={props.maxPage}
      onClearSearch={props.onClearSearch}
      onFindNext={() => props.onSearchRequest('next')}
      onFindPrevious={() => props.onSearchRequest('previous')}
      onNextPage={props.onNextPage}
      onPageChange={props.onPageChange}
      onPreviousPage={props.onPreviousPage}
      onRotateClockwise={props.onRotateClockwise}
      onSearchFocusChange={props.onSearchFocusChange}
      searchIndexingHint={props.searchIndexingHint}
      onSearchQueryChange={props.onSearchQueryChange}
      onSetFitWidth={props.onSetFitWidth}
      onSetZoom={props.onSetZoom}
      onToolbarActiveChange={props.onToolbarActiveChange}
      onToolbarInteraction={props.onToolbarInteraction}
      onZoomIn={props.onZoomIn}
      onZoomOut={props.onZoomOut}
      page={props.page}
      searchQuery={props.searchQuery}
      searchStatus={props.searchStatus}
      zoomMode={props.zoomMode}
      zoom={props.zoom}
    />
  );
}

interface PdfViewportDocumentProps {
  fitWidthTargetWidth: number | null;
  highlightLocators: Array<{
    id: string;
    page: number;
    rects?: Array<{ height: number; width: number; x: number; y: number }>;
    x: number | null;
    y: number | null;
  }>;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onPageLoadSuccess: (pageNumber: number, baseWidth: number) => void;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  onTextLayerRender: (pageNumber: number) => void;
  pageElementsRef: PdfPageElementsRef;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  rotation: number;
  searchHighlights: PdfSearchVisualHighlight[];
  totalPages: number | null;
  zoomMode: 'custom' | 'fit-width';
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
        onPageLoadSuccess={props.onPageLoadSuccess}
        pageElementsRef={props.pageElementsRef}
        pdfSelectionLocator={props.pdfSelectionLocator}
        fitWidthTargetWidth={props.fitWidthTargetWidth}
        rotation={props.rotation}
        searchHighlights={props.searchHighlights}
        totalPages={props.totalPages}
        zoomMode={props.zoomMode}
        zoom={props.zoom}
      />
    </Document>
  );
}

function PdfDocumentPages({
  highlightLocators,
  onTextContentLoad,
  onTextLayerRender,
  onPageLoadSuccess,
  pageElementsRef,
  pdfSelectionLocator,
  fitWidthTargetWidth,
  rotation,
  searchHighlights,
  totalPages,
  zoomMode,
  zoom
}: {
  fitWidthTargetWidth: number | null;
  highlightLocators: Array<{
    id: string;
    page: number;
    rects?: Array<{ height: number; width: number; x: number; y: number }>;
    x: number | null;
    y: number | null;
  }>;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  onTextLayerRender: (pageNumber: number) => void;
  onPageLoadSuccess: (pageNumber: number, baseWidth: number) => void;
  pageElementsRef: PdfPageElementsRef;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  rotation: number;
  searchHighlights: PdfSearchVisualHighlight[];
  totalPages: number | null;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}) {
  if (!totalPages) {
    return null;
  }
  return Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + PDF_PAGE_MIN;
    return renderPdfPage({
      highlightLocators,
      onPageLoadSuccess,
      onTextContentLoad,
      onTextLayerRender,
      pageElementsRef,
      pageNumber,
      pdfSelectionLocator,
      fitWidthTargetWidth,
      rotation,
      searchHighlights,
      zoomMode,
      zoom
    });
  });
}
