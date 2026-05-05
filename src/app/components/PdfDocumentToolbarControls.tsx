import { ArrowDownToLine, ArrowUpToLine, Search, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger, AppIconButton, AppInput } from '../../shared/ui';

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
          className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent px-2 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
