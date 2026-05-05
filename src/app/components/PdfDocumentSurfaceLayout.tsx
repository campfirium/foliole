import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfSearchRequest, PdfSearchStatus, PdfSearchTarget } from './PdfDocumentSearch';
import { PdfDocumentViewport } from './PdfDocumentViewport';
import type { PdfPageDimensions } from './pdfPageDimensions';

interface PdfDocumentSurfaceLayoutProps {
  clearPageJumpRequest: (requestId: number) => void;
  handleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleExternalLinkClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleSearchRequest: (direction: 'next' | 'previous') => void;
  handleSearchRequestHandled: (requestId: number) => void;
  handleSearchTargetHandled: (targetId: number) => void;
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  loadError: string | null;
  maxPage: number;
  page: number;
  pageJumpRequest: PdfJumpRequest | null;
  persistedPageCount: number | null;
  persistedPageDimensions: Record<number, PdfPageDimensions>;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSelectionContextMenu: JSX.Element;
  pdfSource: string;
  reportLoadError: (message: string) => void;
  reportLoadSuccess: (numPages: number) => void;
  requestPageChange: (value: number) => void;
  rotateClockwise: () => void;
  rotation: number;
  searchIndexingHint: string | null;
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
  searchStatus: PdfSearchStatus;
  setSearchQuery: (value: string) => void;
  setSearchStatus: (status: PdfSearchStatus) => void;
  setFitWidth: () => void;
  setZoom: (value: number) => void;
  setVisibleLocation: (page: number, positionY: number) => void;
  stepPage: (step: 1 | -1) => void;
  surfaceRef: MutableRefObject<HTMLElement | null>;
  totalPages: number | null;
  zoomMode: 'custom' | 'fit-width';
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
      onClearSearch={() => props.setSearchQuery('')}
      onContextMenu={props.handleContextMenu}
      onLoadError={(message) => props.reportLoadError(message)}
      onLoadSuccess={(numPages) => props.reportLoadSuccess(numPages)}
      onNextPage={() => props.stepPage(1)}
      onPageChange={props.requestPageChange}
      onPreviousPage={() => props.stepPage(-1)}
      onRotateClockwise={props.rotateClockwise}
      searchIndexingHint={props.searchIndexingHint}
      onSearchQueryChange={(value) => props.setSearchQuery(value)}
      onSearchRequest={props.handleSearchRequest}
      onSearchRequestHandled={props.handleSearchRequestHandled}
      onSearchStatusChange={props.setSearchStatus}
      onSearchTargetHandled={props.handleSearchTargetHandled}
      onSetFitWidth={props.setFitWidth}
      onSetZoom={props.setZoom}
      onZoomIn={props.zoomIn}
      onZoomOut={props.zoomOut}
      visiblePage={props.page}
      page={props.page}
      pageJumpRequest={props.pageJumpRequest}
      persistedPageCount={props.persistedPageCount}
      persistedPageDimensions={props.persistedPageDimensions}
      pdfSelectionLocator={props.pdfSelectionLocator}
      pdfSource={props.pdfSource}
      rotation={props.rotation}
      searchQuery={props.searchQuery}
      searchRequest={props.searchRequest}
      searchTarget={props.searchTarget}
      searchStatus={props.searchStatus}
      setVisibleLocation={props.setVisibleLocation}
      totalPages={props.totalPages}
      zoomMode={props.zoomMode}
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
      onClickCapture={props.handleExternalLinkClick}
      ref={props.surfaceRef}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">{renderViewport(props)}</div>
      {props.pdfSelectionContextMenu}
    </section>
  );
}
