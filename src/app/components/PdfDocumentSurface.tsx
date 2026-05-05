import { useEffect, useMemo, useRef, useState } from 'react';
import { pdfjs } from 'react-pdf';

import type { NodeViewState } from '../../store/workspaceStore';

import { PdfDocumentViewport } from './PdfDocumentViewport';

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

export function PdfDocumentSurface({ nodeViewState, onViewStateChange, sourceHint }: PdfDocumentSurfaceProps) {
  const { handlePageChange, loadError, maxPage, page, pdfSource, setLoadError, setPage, setTotalPages, setZoom, zoom } =
    usePdfSurfaceState(nodeViewState, onViewStateChange, sourceHint);
  const [pageJumpRequest, setPageJumpRequest] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);

  const handlePageInputChange = (value: number) => {
    handlePageChange(value);
    setPageJumpRequest(clampInteger(value, PDF_PAGE_MIN, maxPage));
  };

  const handlePageStep = (direction: -1 | 1) => {
    const nextPage = clampInteger(page + direction, PDF_PAGE_MIN, maxPage);
    handlePageChange(nextPage);
    setPageJumpRequest(nextPage);
  };

  return (
    <section aria-label="PDF reader panel" className="relative flex min-h-0 flex-1 flex-col bg-bg-canvas" data-testid="pdf-document-surface">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <PdfDocumentViewport
          loadError={loadError}
          maxPage={maxPage}
          onNextPage={() => handlePageStep(1)}
          onLoadError={(message) => setLoadError(message)}
          onLoadSuccess={(numPages) => {
            setLoadError(null);
            setTotalPages(numPages);
          }}
          onPageChange={handlePageInputChange}
          onPreviousPage={() => handlePageStep(-1)}
          onRotateClockwise={() => setRotation((current) => (current + 90) % 360)}
          onZoomIn={() => setZoom((current) => Math.min(PDF_ZOOM_MAX, current + PDF_ZOOM_STEP))}
          onZoomOut={() => setZoom((current) => Math.max(PDF_ZOOM_MIN, current - PDF_ZOOM_STEP))}
          page={page}
          pageJumpRequest={pageJumpRequest}
          pdfSource={pdfSource}
          rotation={rotation}
          setPageJumpRequest={setPageJumpRequest}
          setVisiblePage={(value) => setPage(value)}
          totalPages={maxPage === Number.MAX_SAFE_INTEGER ? null : maxPage}
          zoom={zoom}
        />
      </div>
    </section>
  );
}
