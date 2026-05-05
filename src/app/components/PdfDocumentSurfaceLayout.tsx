import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfSearchRequest, PdfSearchStatus } from './PdfDocumentSearch';
import { PdfDocumentViewport } from './PdfDocumentViewport';

interface PdfDocumentSurfaceLayoutProps {
  clearPageJumpRequest: (requestId: number) => void;
  handleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleSearchRequest: (direction: 'next' | 'previous') => void;
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  loadError: string | null;
  maxPage: number;
  page: number;
  pageJumpRequest: PdfJumpRequest | null;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSelectionContextMenu: JSX.Element;
  pdfSource: string;
  reportLoadError: (message: string) => void;
  reportLoadSuccess: (numPages: number) => void;
  requestPageChange: (value: number) => void;
  rotateClockwise: () => void;
  rotation: number;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchStatus: PdfSearchStatus;
  setSearchQuery: (value: string) => void;
  setSearchStatus: (status: PdfSearchStatus) => void;
  setVisiblePage: (page: number) => void;
  stepPage: (step: 1 | -1) => void;
  surfaceRef: MutableRefObject<HTMLElement | null>;
  totalPages: number | null;
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
}

function renderViewport(props: Omit<PdfDocumentSurfaceLayoutProps, 'pdfSelectionContextMenu'>) {
  return (
    <PdfDocumentViewport
      clearPageJumpRequest={props.clearPageJumpRequest}
      highlightLocators={props.highlightLocators}
      loadError={props.loadError}
      maxPage={props.maxPage}
      onContextMenu={props.handleContextMenu}
      onLoadError={(message) => props.reportLoadError(message)}
      onLoadSuccess={(numPages) => props.reportLoadSuccess(numPages)}
      onNextPage={() => props.stepPage(1)}
      onPageChange={props.requestPageChange}
      onPreviousPage={() => props.stepPage(-1)}
      onRotateClockwise={props.rotateClockwise}
      onSearchQueryChange={(value) => props.setSearchQuery(value)}
      onSearchRequest={props.handleSearchRequest}
      onSearchStatusChange={props.setSearchStatus}
      onZoomIn={props.zoomIn}
      onZoomOut={props.zoomOut}
      page={props.page}
      pageJumpRequest={props.pageJumpRequest}
      pdfSelectionLocator={props.pdfSelectionLocator}
      pdfSource={props.pdfSource}
      rotation={props.rotation}
      searchQuery={props.searchQuery}
      searchRequest={props.searchRequest}
      searchStatus={props.searchStatus}
      setVisiblePage={props.setVisiblePage}
      totalPages={props.totalPages}
      zoom={props.zoom}
    />
  );
}

export function PdfDocumentSurfaceLayout(props: PdfDocumentSurfaceLayoutProps) {
  return (
    <section
      aria-label="PDF reader panel"
      className="pdf-document-surface relative flex min-h-0 flex-1 flex-col bg-bg-canvas"
      data-testid="pdf-document-surface"
      ref={props.surfaceRef}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">{renderViewport(props)}</div>
      {props.pdfSelectionContextMenu}
    </section>
  );
}
