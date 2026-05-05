import { useEffect, useMemo, useState } from 'react';

import { AppButton, AppInput } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';

const PDF_PAGE_MIN = 1;
const PDF_ZOOM_DEFAULT = 100;
const PDF_ZOOM_MAX = 200;
const PDF_ZOOM_MIN = 50;
const PDF_ZOOM_STEP = 10;

interface PdfDocumentSurfaceProps {
  sourceHint: string;
  sourceLabel: string;
  nodeViewState?: NodeViewState;
  onViewStateChange: (viewState: NodeViewState) => void;
}

interface PdfPageControlsProps {
  onNextPage: () => void;
  onPageChange: (value: number) => void;
  onPreviousPage: () => void;
  page: number;
}

interface PdfZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoom: number;
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function resolveInitialPage(nodeViewState?: NodeViewState) {
  return clampInteger(nodeViewState?.selection.from ?? PDF_PAGE_MIN, PDF_PAGE_MIN, Number.MAX_SAFE_INTEGER);
}

function resolveInitialZoom(nodeViewState?: NodeViewState) {
  return clampInteger(nodeViewState?.selection.to ?? PDF_ZOOM_DEFAULT, PDF_ZOOM_MIN, PDF_ZOOM_MAX);
}

function resolvePdfSourceUrl(sourceHint: string, page: number, zoom: number) {
  const trimmedSourceHint = sourceHint.trim();
  if (!trimmedSourceHint) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmedSourceHint) || /^file:\/\//i.test(trimmedSourceHint)) {
    return `${encodeURI(trimmedSourceHint)}#page=${page}&zoom=${zoom}`;
  }

  if (/^[A-Za-z]:[\\/]/.test(trimmedSourceHint)) {
    const normalizedPath = trimmedSourceHint.replace(/\\/g, '/');
    return `file:///${encodeURI(normalizedPath)}#page=${page}&zoom=${zoom}`;
  }

  if (trimmedSourceHint.startsWith('/')) {
    return `file://${encodeURI(trimmedSourceHint)}#page=${page}&zoom=${zoom}`;
  }

  return `${encodeURI(trimmedSourceHint)}#page=${page}&zoom=${zoom}`;
}

function PdfPageControls({ onNextPage, onPageChange, onPreviousPage, page }: PdfPageControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <AppButton aria-label="Previous page" onClick={onPreviousPage} size="sm" variant="ghost">
        Prev
      </AppButton>
      <label className="sr-only" htmlFor="pdf-page-input">
        PDF page
      </label>
      <AppInput
        aria-label="PDF page"
        className="h-8 w-16 px-2 text-center text-sm"
        id="pdf-page-input"
        min={PDF_PAGE_MIN}
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
      <AppButton aria-label="Next page" onClick={onNextPage} size="sm" variant="ghost">
        Next
      </AppButton>
    </div>
  );
}

function PdfZoomControls({ onZoomIn, onZoomOut, zoom }: PdfZoomControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <AppButton aria-label="Zoom out" onClick={onZoomOut} size="sm" variant="ghost">
        -
      </AppButton>
      <p aria-live="polite" className="min-w-14 text-center text-xs text-foreground/70" data-testid="pdf-zoom-value">
        {zoom}%
      </p>
      <AppButton aria-label="Zoom in" onClick={onZoomIn} size="sm" variant="ghost">
        +
      </AppButton>
    </div>
  );
}

export function PdfDocumentSurface({ nodeViewState, onViewStateChange, sourceHint, sourceLabel }: PdfDocumentSurfaceProps) {
  const [page, setPage] = useState(() => resolveInitialPage(nodeViewState));
  const [zoom, setZoom] = useState(() => resolveInitialZoom(nodeViewState));

  useEffect(() => {
    setPage(resolveInitialPage(nodeViewState));
    setZoom(resolveInitialZoom(nodeViewState));
  }, [nodeViewState]);

  useEffect(() => {
    onViewStateChange({
      scrollTop: page,
      selection: {
        from: page,
        to: zoom
      }
    });
  }, [onViewStateChange, page, zoom]);

  const pdfSourceUrl = useMemo(() => resolvePdfSourceUrl(sourceHint, page, zoom), [page, sourceHint, zoom]);
  const handlePageChange = (value: number) => {
    setPage(clampInteger(value, PDF_PAGE_MIN, Number.MAX_SAFE_INTEGER));
  };

  return (
    <section aria-label="PDF reader panel" className="flex min-h-0 flex-1 flex-col bg-bg-panel" data-testid="pdf-document-surface">
      <div className="mx-auto flex min-h-0 w-full max-w-[var(--document-max-width)] flex-1 flex-col px-6 py-5 max-[1080px]:px-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <p className="mr-auto truncate text-sm font-semibold text-foreground">{sourceLabel}</p>
            <PdfPageControls
              onNextPage={() => setPage((current) => current + 1)}
              onPageChange={handlePageChange}
              onPreviousPage={() => setPage((current) => Math.max(PDF_PAGE_MIN, current - 1))}
              page={page}
            />
            <PdfZoomControls
              onZoomIn={() => setZoom((current) => Math.min(PDF_ZOOM_MAX, current + PDF_ZOOM_STEP))}
              onZoomOut={() => setZoom((current) => Math.max(PDF_ZOOM_MIN, current - PDF_ZOOM_STEP))}
              zoom={zoom}
            />
          </div>
          <div className="flex min-h-0 flex-1 bg-bg-canvas p-3">
            <iframe
              className="h-full min-h-[360px] w-full rounded-md border border-border bg-bg-panel"
              data-testid="pdf-document-iframe"
              src={pdfSourceUrl}
              title={`PDF reader: ${sourceLabel}`}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
