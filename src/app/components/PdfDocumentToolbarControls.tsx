import { ArrowDownToLine, ArrowUpToLine, Search, X } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';

import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger, AppIconButton, AppInput } from '../../shared/ui';

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

interface PageControlsProps {
  displayPage: number;
  maxPage: number;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onToolbarInteraction: () => void;
}

interface ZoomControlsProps {
  onPdfReadingModeChange: (value: 'original' | 'inverted' | 'warm') => void;
  onRotateClockwise: () => void;
  onSetFitWidth: () => void;
  onSetZoom: (value: number) => void;
  onToolbarInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  pdfReadingMode: 'original' | 'inverted' | 'warm';
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

function sanitizePageInput(value: string) {
  return value.replace(/\D/g, '');
}

function clampPageInputValue(value: number, maxPage: number) {
  const resolvedMaxPage = Number.isFinite(maxPage) ? Math.max(1, maxPage) : Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.min(resolvedMaxPage, value));
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

function PdfReadingModeLabel(props: { value: ZoomControlsProps['pdfReadingMode'] }) {
  const labels = {
    original: 'Original',
    inverted: 'Inverted',
    warm: 'Warm'
  } as const;
  return labels[props.value];
}

function PdfReadingModeControl(props: {
  onChange: ZoomControlsProps['onPdfReadingModeChange'];
  onToolbarInteraction: () => void;
  value: ZoomControlsProps['pdfReadingMode'];
}) {
  const options = [
    { label: 'Original', value: 'original' },
    { label: 'Inverted', value: 'inverted' },
    { label: 'Warm', value: 'warm' }
  ] as const;

  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label="Set PDF reading mode"
          className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent px-2 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus:outline-none"
          type="button"
        >
          <PdfReadingModeLabel value={props.value} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="start" className="min-w-[132px] p-1" sideOffset={8}>
        {options.map((option) => (
          <AppDropdownMenuItem
            key={option.value}
            onSelect={() => {
              props.onToolbarInteraction();
              props.onChange(option.value);
            }}
          >
            {option.label}
          </AppDropdownMenuItem>
        ))}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

export function PdfZoomControls({
  onPdfReadingModeChange,
  onRotateClockwise,
  onSetFitWidth,
  onSetZoom,
  onToolbarInteraction,
  onZoomIn,
  onZoomOut,
  pdfReadingMode,
  zoomMode,
  zoom
}: ZoomControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <PdfReadingModeControl onChange={onPdfReadingModeChange} onToolbarInteraction={onToolbarInteraction} value={pdfReadingMode} />
      <div className="h-5 w-px bg-border/40" />
      <PdfZoomControlsInner onRotateClockwise={onRotateClockwise} onSetFitWidth={onSetFitWidth} onSetZoom={onSetZoom} onToolbarInteraction={onToolbarInteraction} onZoomIn={onZoomIn} onZoomOut={onZoomOut} zoom={zoom} zoomMode={zoomMode} />
    </div>
  );
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
  const { pageInputValue, handlePageInputBlur, handlePageInputChange, handlePageInputFocus, handlePageInputKeyDown } = usePdfPageInputState({
    displayPage,
    maxPage,
    onPageChange,
    onToolbarInteraction
  });
  const pageCountLabel = Number.isFinite(maxPage) ? maxPage : '--';
  const canGoPrevious = displayPage > 1;
  const canGoNext = Number.isFinite(maxPage) ? displayPage < maxPage : true;

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
        onBlur={handlePageInputBlur}
        onChange={(event) => handlePageInputChange(event.target.value)}
        onFocus={handlePageInputFocus}
        onKeyDown={handlePageInputKeyDown}
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

function usePdfPageInputState(args: {
  displayPage: number;
  maxPage: number;
  onPageChange: (value: number) => void;
  onToolbarInteraction: () => void;
}) {
  const [pageInputValue, setPageInputValue] = useState(() => String(args.displayPage));
  const [isEditingPageInput, setIsEditingPageInput] = useState(false);
  const [pendingCommittedPageValue, setPendingCommittedPageValue] = useState<string | null>(null);

  useEffect(() => {
    if (isEditingPageInput) {
      return;
    }
    if (pendingCommittedPageValue !== null) {
      if (pendingCommittedPageValue === String(args.displayPage)) {
        setPendingCommittedPageValue(null);
      } else {
        setPageInputValue(pendingCommittedPageValue);
        return;
      }
    }
    setPageInputValue(String(args.displayPage));
  }, [args.displayPage, isEditingPageInput, pendingCommittedPageValue]);

  const commitPageInputValue = () => {
    setIsEditingPageInput(false);
    const digitsOnly = sanitizePageInput(pageInputValue);
    if (!digitsOnly) {
      setPendingCommittedPageValue(null);
      setPageInputValue(String(args.displayPage));
      return;
    }
    const nextPage = clampPageInputValue(Number(digitsOnly), args.maxPage);
    const nextPageValue = String(nextPage);
    setPendingCommittedPageValue(nextPageValue);
    setPageInputValue(nextPageValue);
    args.onToolbarInteraction();
    args.onPageChange(nextPage);
  };

  return {
    handlePageInputBlur: commitPageInputValue,
    handlePageInputChange: (value: string) => {
      setIsEditingPageInput(true);
      setPendingCommittedPageValue(null);
      setPageInputValue(sanitizePageInput(value));
    },
    handlePageInputFocus: () => setIsEditingPageInput(true),
    handlePageInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      commitPageInputValue();
    },
    pageInputValue
  };
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
