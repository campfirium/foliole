import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

import { AppButton, AppInput } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';

const PDF_PAGE_MIN = 1;
const PDF_ZOOM_DEFAULT = 100;
const PDF_ZOOM_MAX = 200;
const PDF_ZOOM_MIN = 50;
const PDF_ZOOM_STEP = 10;

function configurePdfWorker() {
  const workerUrl = new URL('react-pdf/dist/pdf.worker.entry.js', import.meta.url).toString();

  // Ensure a stale fake-worker instance from previous hot reloads cannot win over the current runtime.
  if ('pdfjsWorker' in globalThis) {
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'pdfjsWorker');
  }

  pdfjs.GlobalWorkerOptions.workerSrc = `${workerUrl}?v=${encodeURIComponent(pdfjs.version)}`;
}

configurePdfWorker();

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

interface PdfToolbarProps {
  maxPage: number;
  onPageChange: (value: number) => void;
  onSetPage: (updater: (value: number) => number) => void;
  onSetZoom: (updater: (value: number) => number) => void;
  page: number;
  sourceLabel: string;
  zoom: number;
}

interface PdfViewportProps {
  loadError: string | null;
  onLoadError: (message: string) => void;
  onLoadSuccess: (numPages: number) => void;
  page: number;
  pdfSource: string;
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

function resolvePdfSource(sourceHint: string) {
  const trimmedSourceHint = sourceHint.trim();
  if (!trimmedSourceHint) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmedSourceHint) || /^file:\/\//i.test(trimmedSourceHint)) {
    return encodeURI(trimmedSourceHint);
  }

  if (/^[A-Za-z]:[\\/]/.test(trimmedSourceHint)) {
    const normalizedPath = trimmedSourceHint.replace(/\\/g, '/');
    return `file:///${encodeURI(normalizedPath)}`;
  }

  if (trimmedSourceHint.startsWith('/')) {
    return `file://${encodeURI(trimmedSourceHint)}`;
  }

  return encodeURI(trimmedSourceHint);
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

function PdfToolbar({ maxPage, onPageChange, onSetPage, onSetZoom, page, sourceLabel, zoom }: PdfToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <p className="mr-auto truncate text-sm font-semibold text-foreground">{sourceLabel}</p>
      <PdfPageControls
        onNextPage={() => onSetPage((current) => clampInteger(current + 1, PDF_PAGE_MIN, maxPage))}
        onPageChange={onPageChange}
        onPreviousPage={() => onSetPage((current) => clampInteger(current - 1, PDF_PAGE_MIN, maxPage))}
        page={page}
      />
      <PdfZoomControls
        onZoomIn={() => onSetZoom((current) => Math.min(PDF_ZOOM_MAX, current + PDF_ZOOM_STEP))}
        onZoomOut={() => onSetZoom((current) => Math.max(PDF_ZOOM_MIN, current - PDF_ZOOM_STEP))}
        zoom={zoom}
      />
    </div>
  );
}

function PdfViewport({ loadError, onLoadError, onLoadSuccess, page, pdfSource, zoom }: PdfViewportProps) {
  if (loadError) {
    return (
      <div className="flex min-h-[360px] w-full items-center justify-center rounded-md border border-border bg-bg-panel p-6">
        <p className="text-sm text-foreground/70" data-testid="pdf-document-load-error">
          {loadError}
        </p>
      </div>
    );
  }

  return (
    <Document
      className="w-full"
      data-testid="pdf-document-view"
      file={pdfSource}
      loading={
        <div className="flex min-h-[360px] items-center justify-center rounded-md border border-border bg-bg-panel">
          <p className="text-sm text-foreground/70">Loading PDF...</p>
        </div>
      }
      noData={<p className="text-sm text-foreground/70">No PDF file selected.</p>}
      onLoadError={(error) => onLoadError(error.message || 'Failed to load PDF document.')}
      onLoadSuccess={({ numPages }: { numPages: number }) => onLoadSuccess(numPages)}
    >
      <Page
        className="overflow-hidden rounded-md border border-border bg-bg-panel shadow-sm"
        data-testid="pdf-document-page"
        pageNumber={page}
        renderAnnotationLayer={false}
        renderTextLayer={false}
        scale={zoom / 100}
      />
    </Document>
  );
}

function usePdfSurfaceState(
  nodeViewState: NodeViewState | undefined,
  onViewStateChange: (viewState: NodeViewState) => void,
  sourceHint: string
) {
  const [page, setPage] = useState(() => resolveInitialPage(nodeViewState));
  const [zoom, setZoom] = useState(() => resolveInitialZoom(nodeViewState));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const onViewStateChangeRef = useRef(onViewStateChange);

  useEffect(() => {
    onViewStateChangeRef.current = onViewStateChange;
  }, [onViewStateChange]);

  useEffect(() => {
    setPage(resolveInitialPage(nodeViewState));
    setZoom(resolveInitialZoom(nodeViewState));
  }, [nodeViewState]);

  useEffect(() => {
    setLoadError(null);
    setTotalPages(null);
  }, [sourceHint]);

  useEffect(() => {
    if (!totalPages) {
      return;
    }
    setPage((current) => clampInteger(current, PDF_PAGE_MIN, totalPages));
  }, [totalPages]);

  useEffect(() => {
    onViewStateChangeRef.current({
      scrollTop: page,
      selection: {
        from: page,
        to: zoom
      }
    });
  }, [page, zoom]);

  const pdfSource = useMemo(() => resolvePdfSource(sourceHint), [sourceHint]);
  const maxPage = totalPages ?? Number.MAX_SAFE_INTEGER;

  return {
    handlePageChange: (value: number) => setPage(clampInteger(value, PDF_PAGE_MIN, maxPage)),
    loadError,
    maxPage,
    page,
    pdfSource,
    setLoadError,
    setPage,
    setTotalPages,
    setZoom,
    zoom
  };
}

export function PdfDocumentSurface({ nodeViewState, onViewStateChange, sourceHint, sourceLabel }: PdfDocumentSurfaceProps) {
  const { handlePageChange, loadError, maxPage, page, pdfSource, setLoadError, setPage, setTotalPages, setZoom, zoom } =
    usePdfSurfaceState(nodeViewState, onViewStateChange, sourceHint);

  return (
    <section aria-label="PDF reader panel" className="flex min-h-0 flex-1 flex-col bg-bg-panel" data-testid="pdf-document-surface">
      <div className="mx-auto flex min-h-0 w-full max-w-[var(--document-max-width)] flex-1 flex-col px-6 py-5 max-[1080px]:px-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-sm">
          <PdfToolbar
            maxPage={maxPage}
            onPageChange={handlePageChange}
            onSetPage={(updater) => setPage((current) => updater(current))}
            onSetZoom={(updater) => setZoom((current) => updater(current))}
            page={page}
            sourceLabel={sourceLabel}
            zoom={zoom}
          />
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-bg-canvas p-3">
            <PdfViewport
              loadError={loadError}
              onLoadError={(message) => setLoadError(message)}
              onLoadSuccess={(numPages) => {
                setLoadError(null);
                setTotalPages(numPages);
              }}
              page={page}
              pdfSource={pdfSource}
              zoom={zoom}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
