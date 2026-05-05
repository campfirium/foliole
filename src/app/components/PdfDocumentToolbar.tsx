import { ChevronDown, ChevronUp, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

import { AppIconButton, AppInput } from '../../shared/ui';

import type { PdfSearchStatus } from './PdfDocumentSearch';

interface PdfDocumentToolbarProps {
  maxPage: number;
  onFindNext: () => void;
  onFindPrevious: () => void;
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  onRotateClockwise: () => void;
  onSearchQueryChange: (value: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  page: number;
  rotation: number;
  searchQuery: string;
  searchStatus: PdfSearchStatus;
  zoom: number;
}

function PdfPageControls({
  maxPage,
  onNextPage,
  onPageChange,
  onPreviousPage,
  page
}: Pick<PdfDocumentToolbarProps, 'maxPage' | 'onNextPage' | 'onPageChange' | 'onPreviousPage' | 'page'>) {
  const pageCountLabel = Number.isFinite(maxPage) ? maxPage : '--';
  const canGoPrevious = page > 1;
  const canGoNext = Number.isFinite(maxPage) ? page < maxPage : true;

  return (
    <div className="flex items-center gap-2">
      <AppIconButton
        className="size-8"
        disabled={!canGoPrevious}
        icon={<ChevronUp aria-hidden="true" size={15} strokeWidth={2.1} />}
        label="Previous page"
        onClick={onPreviousPage}
      />
      <label className="sr-only" htmlFor="pdf-page-input">
        PDF page
      </label>
      <AppInput
        aria-label="PDF page"
        className="h-8 w-14 border-transparent bg-transparent px-2 text-center text-sm"
        id="pdf-page-input"
        min={1}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (!Number.isFinite(value)) {
            return;
          }
          onPageChange(value);
        }}
        type="number"
        value={page}
      />
      <p className="min-w-16 text-xs text-foreground/55" data-testid="pdf-page-count">
        / {pageCountLabel}
      </p>
      <AppIconButton
        className="size-8"
        disabled={!canGoNext}
        icon={<ChevronDown aria-hidden="true" size={15} strokeWidth={2.1} />}
        label="Next page"
        onClick={onNextPage}
      />
    </div>
  );
}

function PdfZoomControls({
  onRotateClockwise,
  onZoomIn,
  onZoomOut,
  rotation,
  zoom
}: Pick<PdfDocumentToolbarProps, 'onRotateClockwise' | 'onZoomIn' | 'onZoomOut' | 'rotation' | 'zoom'>) {
  return (
    <div className="flex items-center gap-1">
      <AppIconButton className="size-8" icon={<ZoomOut aria-hidden="true" size={15} strokeWidth={2.1} />} label="Zoom out" onClick={onZoomOut} />
      <p aria-live="polite" className="min-w-14 text-center text-xs text-foreground/70" data-testid="pdf-zoom-value">
        {zoom}%
      </p>
      <AppIconButton className="size-8" icon={<ZoomIn aria-hidden="true" size={15} strokeWidth={2.1} />} label="Zoom in" onClick={onZoomIn} />
      <div className="h-5 w-px bg-border/40" />
      <AppIconButton
        className="size-8"
        icon={<RotateCw aria-hidden="true" size={15} strokeWidth={2.1} />}
        label="Rotate page clockwise"
        onClick={onRotateClockwise}
      />
      <p aria-live="polite" className="min-w-10 text-center text-xs text-foreground/70" data-testid="pdf-rotation-value">
        {rotation}°
      </p>
    </div>
  );
}

function resolveSearchStatusLabel(status: PdfSearchStatus) {
  if (!status.hasQuery) {
    return 'Search';
  }
  if (status.total === 0) {
    return 'No matches';
  }
  return `${status.current} / ${status.total}`;
}

function PdfSearchControls({
  onFindNext,
  onFindPrevious,
  onSearchQueryChange,
  searchQuery,
  searchStatus
}: Pick<
  PdfDocumentToolbarProps,
  'onFindNext' | 'onFindPrevious' | 'onSearchQueryChange' | 'searchQuery' | 'searchStatus'
>) {
  const canNavigateMatches = searchStatus.hasQuery && searchStatus.total > 0;

  return (
    <div className="flex items-center gap-1">
      <AppInput
        aria-label="PDF search"
        className="h-8 w-36 border-transparent bg-transparent px-2 text-xs"
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !canNavigateMatches) {
            return;
          }
          event.preventDefault();
          if (event.shiftKey) {
            onFindPrevious();
            return;
          }
          onFindNext();
        }}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        placeholder="Search PDF…"
        type="text"
        value={searchQuery}
      />
      <AppIconButton
        className="size-8"
        disabled={!canNavigateMatches}
        icon={<ChevronUp aria-hidden="true" size={15} strokeWidth={2.1} />}
        label="Previous match"
        onClick={onFindPrevious}
      />
      <AppIconButton
        className="size-8"
        disabled={!canNavigateMatches}
        icon={<ChevronDown aria-hidden="true" size={15} strokeWidth={2.1} />}
        label="Next match"
        onClick={onFindNext}
      />
      <p aria-live="polite" className="min-w-16 text-center text-xs text-foreground/70" data-testid="pdf-search-status">
        {resolveSearchStatusLabel(searchStatus)}
      </p>
    </div>
  );
}

export function PdfDocumentToolbar({
  maxPage,
  onFindNext,
  onFindPrevious,
  onNextPage,
  onPageChange,
  onPreviousPage,
  onRotateClockwise,
  onSearchQueryChange,
  onZoomIn,
  onZoomOut,
  page,
  rotation,
  searchQuery,
  searchStatus,
  zoom
}: PdfDocumentToolbarProps) {
  return (
    <div className="mb-4 flex justify-center px-4 pt-3" data-testid="pdf-document-toolbar">
      <div className="flex items-center gap-4 rounded-full bg-gradient-to-b from-bg-elevated/96 via-bg-elevated/82 to-bg-elevated/58 px-4 py-2 shadow-sm backdrop-blur">
        <div className="flex items-center gap-1">
          <PdfZoomControls
            onRotateClockwise={onRotateClockwise}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            rotation={rotation}
            zoom={zoom}
          />
        </div>
        <div className="h-5 w-px bg-border/30" />
        <PdfPageControls
          maxPage={maxPage}
          onNextPage={onNextPage}
          onPageChange={onPageChange}
          onPreviousPage={onPreviousPage}
          page={page}
        />
        <div className="h-5 w-px bg-border/30" />
        <PdfSearchControls
          onFindNext={onFindNext}
          onFindPrevious={onFindPrevious}
          onSearchQueryChange={onSearchQueryChange}
          searchQuery={searchQuery}
          searchStatus={searchStatus}
        />
      </div>
    </div>
  );
}
