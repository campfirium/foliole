import { ArrowDownToLine, ArrowUpToLine, Search, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { AppIconButton, AppInput } from '../../shared/ui';

export { PdfPageControls } from './PdfDocumentPageControls';
import type { PdfSearchStatus } from './PdfDocumentSearch';
import { PdfZoomControls as PdfZoomControlsInner } from './PdfDocumentZoomControls';
import { usePdfSearchInputState } from './pdfSearchInputState';

interface SearchControlsProps {
  onClearSearch: () => void;
  onFindNext: () => void;
  onFindPrevious: () => void;
  onSearchFocusChange: (focused: boolean) => void;
  onSearchQueryChange: (value: string) => void;
  onToolbarInteraction: () => void;
  searchIndexingHint: string | null;
  searchQuery: string;
  searchStatus: PdfSearchStatus;
}

interface ZoomControlsProps {
  onRotateClockwise: () => void;
  onSetFitWidth: () => void;
  onSetZoom: (value: number) => void;
  onToolbarInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
}

function createToolbarAction(handler: () => void, onToolbarInteraction: () => void) {
  return () => {
    onToolbarInteraction();
    handler();
  };
}

function handleSearchInputKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  canNavigateMatches: boolean,
  onFindNext: () => void,
  onFindPrevious: () => void
) {
  const nativeEvent = event.nativeEvent;
  if ('isComposing' in nativeEvent && nativeEvent.isComposing) {
    return;
  }
  if (event.key !== 'Enter' || !canNavigateMatches) {
    return;
  }
  event.preventDefault();
  if (event.shiftKey) {
    onFindPrevious();
    return;
  }
  onFindNext();
}

function resolveSearchStatusLabel(status: PdfSearchStatus, indexingHint: string | null) {
  if (indexingHint) {
    return indexingHint;
  }
  if (!status.hasQuery) {
    return '';
  }
  if (status.total === 0) {
    return 'No matches';
  }
  return `${status.current} / ${status.total}`;
}

export function PdfZoomControls({
  onRotateClockwise,
  onSetFitWidth,
  onSetZoom,
  onToolbarInteraction,
  onZoomIn,
  onZoomOut,
  zoomMode,
  zoom
}: ZoomControlsProps) {
  return (
    <PdfZoomControlsInner onRotateClockwise={onRotateClockwise} onSetFitWidth={onSetFitWidth} onSetZoom={onSetZoom} onToolbarInteraction={onToolbarInteraction} onZoomIn={onZoomIn} onZoomOut={onZoomOut} zoom={zoom} zoomMode={zoomMode} />
  );
}

function PdfSearchInput(props: SearchControlsProps & { canNavigateMatches: boolean }) {
  const { draftQuery, handleSearchCompositionEnd, handleSearchCompositionStart, handleSearchInputChange } = usePdfSearchInputState(props);

  return (
    <AppInput
      aria-label="PDF search"
      className="h-8 w-36 border-transparent bg-transparent px-2 text-xs focus-visible:ring-0"
      onKeyDown={(event) => handleSearchInputKeyDown(event, props.canNavigateMatches, props.onFindNext, props.onFindPrevious)}
      onChange={handleSearchInputChange}
      onBlur={() => props.onSearchFocusChange(false)}
      onCompositionEnd={handleSearchCompositionEnd}
      onCompositionStart={handleSearchCompositionStart}
      onFocus={() => {
        props.onToolbarInteraction();
        props.onSearchFocusChange(true);
      }}
      placeholder="Search PDF…"
      type="text"
      value={draftQuery}
    />
  );
}

function PdfSearchActionButtons(props: SearchControlsProps & { canNavigateMatches: boolean; hasSearchQuery: boolean }) {
  return (
    <>
      <AppIconButton className="size-8" disabled={!props.canNavigateMatches} icon={<ArrowUpToLine aria-hidden="true" size={15} strokeWidth={2.1} />} label="Previous match" onClick={createToolbarAction(props.onFindPrevious, props.onToolbarInteraction)} />
      <AppIconButton className="size-8" disabled={!props.canNavigateMatches} icon={<ArrowDownToLine aria-hidden="true" size={15} strokeWidth={2.1} />} label="Next match" onClick={createToolbarAction(props.onFindNext, props.onToolbarInteraction)} />
      <AppIconButton className="size-8" disabled={!props.hasSearchQuery} icon={<X aria-hidden="true" size={15} strokeWidth={2.1} />} label="Clear search" onClick={createToolbarAction(props.onClearSearch, props.onToolbarInteraction)} />
    </>
  );
}

export function PdfSearchControls(props: SearchControlsProps) {
  const canNavigateMatches = !props.searchIndexingHint && props.searchStatus.hasQuery && props.searchStatus.total > 0;
  const hasSearchQuery = props.searchQuery.trim().length > 0;

  return (
    <div className="flex items-center gap-1">
      <Search aria-hidden="true" className="ml-1 text-foreground/55" size={15} strokeWidth={2.1} />
      <PdfSearchInput {...props} canNavigateMatches={canNavigateMatches} />
      <PdfSearchActionButtons {...props} canNavigateMatches={canNavigateMatches} hasSearchQuery={hasSearchQuery} />
      <p aria-live="polite" className="min-w-16 text-center text-xs text-foreground/70" data-testid="pdf-search-status">
        {resolveSearchStatusLabel(props.searchStatus, props.searchIndexingHint)}
      </p>
    </div>
  );
}
