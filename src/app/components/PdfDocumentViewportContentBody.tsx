import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

import type { PdfSearchStatus, PdfSearchVisualHighlight } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { PdfViewportDocument, PdfViewportToolbar } from './PdfDocumentViewportRenderParts';
import type { PdfPageTextEntry } from './pdfPageText';

interface PdfDocumentViewportContentBodyProps {
  handleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleScroll: () => void;
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  isToolbarVisible: boolean;
  maxPage: number;
  onClearSearch: () => void;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onTextContentLoad: (pageNumber: number, text: PdfPageTextEntry) => void;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchFocusChange: (focused: boolean) => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRequest: (direction: 'next' | 'previous') => void;
  onSetZoom: (value: number) => void;
  onToolbarActiveChange: (active: boolean) => void;
  onTextLayerRender: (pageNumber: number) => void;
  onToolbarInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  pageElementsRef: PdfPageElementsRef;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  pdfSource: string;
  rotation: number;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  searchIndexingHint: string | null;
  searchHighlights: PdfSearchVisualHighlight[];
  searchQuery: string;
  searchStatus: PdfSearchStatus;
  totalPages: number | null;
  zoom: number;
}

export function PdfDocumentViewportContentBody(props: PdfDocumentViewportContentBodyProps) {
  return (
    <div
      className="app-scrollbar flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-auto px-2 pb-5"
      onContextMenu={props.handleContextMenu}
      onScroll={props.handleScroll}
      data-testid="pdf-scroll-container"
      ref={props.scrollContainerRef}
    >
      <PdfViewportToolbar
        isVisible={props.isToolbarVisible}
        maxPage={props.maxPage}
        onClearSearch={props.onClearSearch}
        onNextPage={props.onNextPage}
        onPageChange={props.onPageChange}
        onPreviousPage={props.onPreviousPage}
        onRotateClockwise={props.onRotateClockwise}
        onSearchFocusChange={props.onSearchFocusChange}
        searchIndexingHint={props.searchIndexingHint}
        onSearchQueryChange={props.onSearchQueryChange}
        onSearchRequest={props.onSearchRequest}
        onSetZoom={props.onSetZoom}
        onToolbarActiveChange={props.onToolbarActiveChange}
        onToolbarInteraction={props.onToolbarInteraction}
        onZoomIn={props.onZoomIn}
        onZoomOut={props.onZoomOut}
        page={props.page}
        searchQuery={props.searchQuery}
        searchStatus={props.searchStatus}
        zoom={props.zoom}
      />
      <PdfViewportDocument
        highlightLocators={props.highlightLocators}
        onLoadError={props.onLoadError}
        onLoadSuccess={props.onLoadSuccess}
        onTextContentLoad={props.onTextContentLoad}
        onTextLayerRender={props.onTextLayerRender}
        pageElementsRef={props.pageElementsRef}
        pdfSelectionLocator={props.pdfSelectionLocator}
        pdfSource={props.pdfSource}
        rotation={props.rotation}
        searchHighlights={props.searchHighlights}
        totalPages={props.totalPages}
        zoom={props.zoom}
      />
    </div>
  );
}
