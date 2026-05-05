import { ArrowDownToLine, ArrowUpToLine, Search, X } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';

import { AppIconButton, AppInput } from '../../shared/ui';

import type { PdfSearchStatus } from './PdfDocumentSearch';
import { PdfZoomControls as PdfZoomControlsInner } from './PdfDocumentZoomControls';

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

interface PageControlsProps {
  displayPage: number;
  maxPage: number;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onToolbarInteraction: () => void;
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

export function PdfZoomControls({ onRotateClockwise, onSetFitWidth, onSetZoom, onToolbarInteraction, onZoomIn, onZoomOut, zoomMode, zoom }: ZoomControlsProps) {
  return <PdfZoomControlsInner onRotateClockwise={onRotateClockwise} onSetFitWidth={onSetFitWidth} onSetZoom={onSetZoom} onToolbarInteraction={onToolbarInteraction} onZoomIn={onZoomIn} onZoomOut={onZoomOut} zoom={zoom} zoomMode={zoomMode} />;
}

function PdfPageButtons({ canGoNext, canGoPrevious, onNextPage, onPreviousPage, onToolbarInteraction }: {
  canGoNext: boolean;
  canGoPrevious: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onToolbarInteraction: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <AppIconButton className="size-8" disabled={!canGoPrevious} icon={<ArrowUpToLine aria-hidden="true" size={15} strokeWidth={2.1} />} label="Previous page" onClick={createToolbarAction(onPreviousPage, onToolbarInteraction)} />
      <AppIconButton className="size-8" disabled={!canGoNext} icon={<ArrowDownToLine aria-hidden="true" size={15} strokeWidth={2.1} />} label="Next page" onClick={createToolbarAction(onNextPage, onToolbarInteraction)} />
    </div>
  );
}

export function PdfPageControls({ displayPage, maxPage, onNextPage, onPageChange, onPreviousPage, onToolbarInteraction }: PageControlsProps) {
  const pageCountLabel = Number.isFinite(maxPage) ? maxPage : '--';
  const [pageInputValue, setPageInputValue] = useState(() => String(displayPage));
  const canGoPrevious = displayPage > 1;
  const canGoNext = Number.isFinite(maxPage) ? displayPage < maxPage : true;

  useEffect(() => {
    setPageInputValue(String(displayPage));
  }, [displayPage]);

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="pdf-page-input">
        PDF page
      </label>
      <AppInput
        aria-label="PDF page"
        className="h-8 w-14 appearance-none border-transparent bg-transparent px-2 text-center text-sm focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        id="pdf-page-input"
        inputMode="numeric"
        onChange={(event) => {
          const digitsOnly = event.target.value.replace(/\D/g, '');
          setPageInputValue(digitsOnly);
          if (!digitsOnly) {
            return;
          }
          onToolbarInteraction();
          onPageChange(Number(digitsOnly));
        }}
        pattern="[0-9]*"
        type="text"
        value={pageInputValue}
      />
      <p className="min-w-16 text-xs text-foreground/55" data-testid="pdf-page-count">
        / {pageCountLabel}
      </p>
      <PdfPageButtons
        canGoNext={canGoNext}
        canGoPrevious={canGoPrevious}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        onToolbarInteraction={onToolbarInteraction}
      />
    </div>
  );
}

function PdfSearchInput(props: SearchControlsProps & { canNavigateMatches: boolean }) {
  return (
    <AppInput
      aria-label="PDF search"
      className="h-8 w-36 border-transparent bg-transparent px-2 text-xs focus-visible:ring-0"
      onKeyDown={(event) => handleSearchInputKeyDown(event, props.canNavigateMatches, props.onFindNext, props.onFindPrevious)}
      onChange={(event) => {
        props.onToolbarInteraction();
        props.onSearchQueryChange(event.target.value);
      }}
      onBlur={() => props.onSearchFocusChange(false)}
      onFocus={() => {
        props.onToolbarInteraction();
        props.onSearchFocusChange(true);
      }}
      placeholder="Search PDF…"
      type="text"
      value={props.searchQuery}
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
