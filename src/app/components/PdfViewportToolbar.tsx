import type { PdfSearchStatus } from './PdfDocumentSearch';
import { PdfDocumentToolbar } from './PdfDocumentToolbar';

interface PdfViewportToolbarProps {
  displayPage: number;
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
      displayPage={props.displayPage}
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
      searchQuery={props.searchQuery}
      searchStatus={props.searchStatus}
      zoomMode={props.zoomMode}
      zoom={props.zoom}
    />
  );
}
