import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MutableRefObject } from 'react';

import type { NodeViewState } from '../../../store/workspaceStore';

import type { PdfJumpRequest, PdfSystemController } from './pdfSystemApi';

const PDF_PAGE_MIN = 1;
const PDF_ZOOM_DEFAULT = 100;
const PDF_ZOOM_MAX = 200;
const PDF_ZOOM_MIN = 50;
const PDF_ZOOM_STEP = 10;

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

function createJumpRequest(nextIdRef: MutableRefObject<number>, page: number): PdfJumpRequest {
  const request = { id: nextIdRef.current, page };
  nextIdRef.current += 1;
  return request;
}

function useNodeViewRestore(
  nodeViewState: NodeViewState | undefined,
  setPage: Dispatch<SetStateAction<number>>,
  setZoom: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    setPage(resolveInitialPage(nodeViewState));
    setZoom(resolveInitialZoom(nodeViewState));
  }, [nodeViewState, setPage, setZoom]);
}

function useSourceReset(sourceHint: string, setLoadError: (value: string | null) => void, setTotalPages: (value: number | null) => void, setPdfSource: (value: string) => void) {
  useEffect(() => {
    setLoadError(null);
    setTotalPages(null);
    setPdfSource(resolvePdfSource(sourceHint));
  }, [setLoadError, setPdfSource, setTotalPages, sourceHint]);
}

function useViewStateSync(page: number, zoom: number, onViewStateChange: (viewState: NodeViewState) => void) {
  const onViewStateChangeRef = useRef(onViewStateChange);
  useEffect(() => {
    onViewStateChangeRef.current = onViewStateChange;
  }, [onViewStateChange]);

  useEffect(() => {
    onViewStateChangeRef.current({
      scrollTop: page,
      selection: {
        from: page,
        to: zoom
      }
    });
  }, [page, zoom]);
}

function usePdfSystemActions(
  page: number,
  maxPage: number,
  setLoadError: Dispatch<SetStateAction<string | null>>,
  setPage: Dispatch<SetStateAction<number>>,
  setPageJumpRequest: Dispatch<SetStateAction<PdfJumpRequest | null>>,
  setPdfSource: Dispatch<SetStateAction<string>>,
  setRotation: Dispatch<SetStateAction<number>>,
  setTotalPages: Dispatch<SetStateAction<number | null>>,
  setZoom: Dispatch<SetStateAction<number>>
) {
  const jumpRequestIdRef = useRef(1);

  return useMemo(
    () => ({
      clearPageJumpRequest: (requestId: number) => {
        setPageJumpRequest((current) => (current?.id === requestId ? null : current));
      },
      openSource: (nextSourceHint: string, nextNodeViewState?: NodeViewState) => {
        setPdfSource(resolvePdfSource(nextSourceHint));
        setPage(resolveInitialPage(nextNodeViewState));
        setZoom(resolveInitialZoom(nextNodeViewState));
        setRotation(0);
        setLoadError(null);
        setTotalPages(null);
        setPageJumpRequest(null);
      },
      reportLoadError: (message: string | null) => {
        setLoadError(message);
      },
      reportLoadSuccess: (numPages: number) => {
        setLoadError(null);
        setTotalPages(numPages);
      },
      requestPageChange: (value: number) => {
        const nextPage = clampInteger(value, PDF_PAGE_MIN, maxPage);
        setPage(nextPage);
        setPageJumpRequest(createJumpRequest(jumpRequestIdRef, nextPage));
      },
      rotateClockwise: () => {
        setRotation((current) => (current + 90) % 360);
      },
      setVisiblePage: (visiblePage: number) => {
        const nextPage = clampInteger(visiblePage, PDF_PAGE_MIN, maxPage);
        setPage(nextPage);
      },
      stepPage: (direction: -1 | 1) => {
        const nextPage = clampInteger(page + direction, PDF_PAGE_MIN, maxPage);
        setPage(nextPage);
        setPageJumpRequest(createJumpRequest(jumpRequestIdRef, nextPage));
      },
      zoomIn: () => {
        setZoom((current) => Math.min(PDF_ZOOM_MAX, current + PDF_ZOOM_STEP));
      },
      zoomOut: () => {
        setZoom((current) => Math.max(PDF_ZOOM_MIN, current - PDF_ZOOM_STEP));
      }
    }),
    [maxPage, page, setLoadError, setPage, setPageJumpRequest, setPdfSource, setRotation, setTotalPages, setZoom]
  );
}

function usePdfCoreState(
  nodeViewState: NodeViewState | undefined,
  onViewStateChange: (viewState: NodeViewState) => void,
  sourceHint: string
): {
  loadError: string | null;
  maxPage: number;
  page: number;
  pageJumpRequest: PdfJumpRequest | null;
  pdfSource: string;
  rotation: number;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setPageJumpRequest: Dispatch<SetStateAction<PdfJumpRequest | null>>;
  setPdfSource: Dispatch<SetStateAction<string>>;
  setRotation: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number | null>>;
  setZoom: Dispatch<SetStateAction<number>>;
  totalPages: number | null;
  zoom: number;
} {
  const [page, setPage] = useState(() => resolveInitialPage(nodeViewState));
  const [zoom, setZoom] = useState(() => resolveInitialZoom(nodeViewState));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [pdfSource, setPdfSource] = useState(() => resolvePdfSource(sourceHint));
  const [pageJumpRequest, setPageJumpRequest] = useState<PdfJumpRequest | null>(null);
  useNodeViewRestore(
    nodeViewState,
    setPage,
    setZoom
  );
  useSourceReset(sourceHint, setLoadError, setTotalPages, setPdfSource);
  useViewStateSync(page, zoom, onViewStateChange);

  useEffect(() => {
    if (!totalPages) {
      return;
    }
    setPage((current) => clampInteger(current, PDF_PAGE_MIN, totalPages));
  }, [totalPages]);

  const maxPage = totalPages ?? Number.MAX_SAFE_INTEGER;
  return {
    loadError,
    maxPage,
    page,
    pageJumpRequest,
    pdfSource,
    rotation,
    setLoadError,
    setPage,
    setPageJumpRequest,
    setPdfSource,
    setRotation,
    setTotalPages,
    setZoom,
    totalPages,
    zoom
  };
}

export function usePdfSystemController(
  nodeViewState: NodeViewState | undefined,
  onViewStateChange: (viewState: NodeViewState) => void,
  sourceHint: string
): PdfSystemController {
  const coreState = usePdfCoreState(nodeViewState, onViewStateChange, sourceHint);
  const actions = usePdfSystemActions(
    coreState.page,
    coreState.maxPage,
    coreState.setLoadError,
    coreState.setPage,
    coreState.setPageJumpRequest,
    coreState.setPdfSource,
    coreState.setRotation,
    coreState.setTotalPages,
    coreState.setZoom
  );

  return {
    actions,
    state: {
      loadError: coreState.loadError,
      maxPage: coreState.maxPage,
      page: coreState.page,
      pageJumpRequest: coreState.pageJumpRequest,
      pdfSource: coreState.pdfSource,
      rotation: coreState.rotation,
      totalPages: coreState.totalPages,
      zoom: coreState.zoom
    }
  };
}
