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
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
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
      <PdfDocumentPages pageElementsRef={props.pageElementsRef} rotation={props.rotation} totalPages={props.totalPages} zoom={props.zoom} />
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

function PdfDocumentPages({ pageElementsRef, rotation, totalPages, zoom }: { pageElementsRef: PdfPageElementsRef; rotation: number; totalPages: number | null; zoom: number }) {
  if (!totalPages) {
    return null;
  }
  return Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + PDF_PAGE_MIN;
    return (
      <div
        className="flex w-full justify-center px-4"
        data-pdf-page-number={pageNumber}
        data-testid="pdf-document-page-shell"
        key={pageNumber}
        ref={(element) => {
          pageElementsRef.current[pageNumber] = element;
        }}
      >
        <Page
          className="mx-auto overflow-hidden rounded-sm bg-bg-panel shadow-sm"
          data-testid="pdf-document-page"
          onRenderTextLayerSuccess={() => stripTextLayerInlineFonts(pageElementsRef.current[pageNumber])}
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
