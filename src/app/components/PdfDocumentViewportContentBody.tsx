import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

import type { PdfSearchStatus } from './PdfDocumentSearch';
import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { PdfViewportDocument, PdfViewportToolbar } from './PdfDocumentViewportRenderParts';

interface PdfDocumentViewportContentBodyProps {
  handleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleScroll: () => void;
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  maxPage: number;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRequest: (direction: 'next' | 'previous') => void;
  onTextLayerRender: (pageNumber: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  pageElementsRef: PdfPageElementsRef;
  pdfSource: string;
  rotation: number;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
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
      ref={props.scrollContainerRef}
    >
      <PdfViewportToolbar
        maxPage={props.maxPage}
        onNextPage={props.onNextPage}
        onPageChange={props.onPageChange}
        onPreviousPage={props.onPreviousPage}
        onRotateClockwise={props.onRotateClockwise}
        onSearchQueryChange={props.onSearchQueryChange}
        onSearchRequest={props.onSearchRequest}
        onZoomIn={props.onZoomIn}
        onZoomOut={props.onZoomOut}
        page={props.page}
        rotation={props.rotation}
        searchQuery={props.searchQuery}
        searchStatus={props.searchStatus}
        zoom={props.zoom}
      />
      <PdfViewportDocument
        highlightLocators={props.highlightLocators}
        onLoadError={props.onLoadError}
        onLoadSuccess={props.onLoadSuccess}
        onTextLayerRender={props.onTextLayerRender}
        pageElementsRef={props.pageElementsRef}
        pdfSource={props.pdfSource}
        rotation={props.rotation}
        totalPages={props.totalPages}
        zoom={props.zoom}
      />
    </div>
  );
}
