import { ArrowDownToLine, ArrowUpToLine, RotateCwSquare, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { AppIconButton, AppInput } from '../../shared/ui';

import type { PdfSearchStatus } from './PdfDocumentSearch';

const PDF_ZOOM_OPTIONS = [100, 125, 150, 175, 200];

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
  maxPage: number;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onToolbarInteraction: () => void;
  page: number;
}

interface ZoomControlsProps {
  onRotateClockwise: () => void;
  onSetZoom: (value: number) => void;
  onToolbarInteraction: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
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

export function PdfZoomControls({ onRotateClockwise, onSetZoom, onToolbarInteraction, onZoomIn, onZoomOut, zoom }: ZoomControlsProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isMenuOpen]);

  return (
    <div className="relative flex items-center gap-1" ref={menuRef}>
      <AppIconButton className="size-8" icon={<ZoomOut aria-hidden="true" size={15} strokeWidth={2.1} />} label="Zoom out" onClick={createToolbarAction(onZoomOut, onToolbarInteraction)} />
      <PdfZoomValueButton isMenuOpen={isMenuOpen} onToolbarInteraction={onToolbarInteraction} setIsMenuOpen={setIsMenuOpen} zoom={zoom} />
      <PdfZoomMenu isMenuOpen={isMenuOpen} onSetZoom={onSetZoom} onToolbarInteraction={onToolbarInteraction} setIsMenuOpen={setIsMenuOpen} />
      <AppIconButton className="size-8" icon={<ZoomIn aria-hidden="true" size={15} strokeWidth={2.1} />} label="Zoom in" onClick={createToolbarAction(onZoomIn, onToolbarInteraction)} />
      <div className="h-5 w-px bg-border/40" />
      <AppIconButton
        className="size-8"
        icon={<RotateCwSquare aria-hidden="true" size={15} strokeWidth={2.1} />}
        label="Rotate page clockwise"
        onClick={createToolbarAction(onRotateClockwise, onToolbarInteraction)}
      />
    </div>
  );
}

function PdfZoomValueButton({
  isMenuOpen,
  onToolbarInteraction,
  setIsMenuOpen,
  zoom
}: {
  isMenuOpen: boolean;
  onToolbarInteraction: () => void;
  setIsMenuOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  zoom: number;
}) {
  return (
    <button
      aria-expanded={isMenuOpen}
      aria-haspopup="menu"
      aria-label="Set zoom level"
      className="inline-flex min-h-8 min-w-14 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent px-2 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus:outline-none"
      onClick={() => {
        onToolbarInteraction();
        setIsMenuOpen((current) => !current);
      }}
      type="button"
    >
      <span aria-live="polite" data-testid="pdf-zoom-value">
        {zoom}%
      </span>
    </button>
  );
}

function PdfZoomMenu({
  isMenuOpen,
  onSetZoom,
  onToolbarInteraction,
  setIsMenuOpen
}: {
  isMenuOpen: boolean;
  onSetZoom: (value: number) => void;
  onToolbarInteraction: () => void;
  setIsMenuOpen: (value: boolean) => void;
}) {
  if (!isMenuOpen) {
    return null;
  }
  return (
    <div className="absolute left-1/2 top-full z-30 mt-2 flex min-w-20 -translate-x-1/2 flex-col rounded-xl border border-border bg-bg-elevated p-1 shadow-sm" role="menu">
      {PDF_ZOOM_OPTIONS.map((option) => (
        <button
          className="min-h-8 rounded-lg px-3 text-left text-xs text-foreground/80 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          key={option}
          onClick={() => {
            onToolbarInteraction();
            onSetZoom(option);
            setIsMenuOpen(false);
          }}
          role="menuitem"
          type="button"
        >
          {option}%
        </button>
      ))}
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

export function PdfPageControls({ maxPage, onNextPage, onPageChange, onPreviousPage, onToolbarInteraction, page }: PageControlsProps) {
  const pageCountLabel = Number.isFinite(maxPage) ? maxPage : '--';
  const canGoPrevious = page > 1;
  const canGoNext = Number.isFinite(maxPage) ? page < maxPage : true;

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
          if (!digitsOnly) {
            return;
          }
          onToolbarInteraction();
          onPageChange(Number(digitsOnly));
        }}
        pattern="[0-9]*"
        type="text"
        value={page}
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
