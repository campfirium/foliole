import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { NodeViewState } from '../../../store/workspaceStore';
import type { NodeAnchorLink } from '../../nodes/model/nodeTypes';

import type { PdfJumpRequest, PdfSystemController } from './pdfSystemApi';
import { createInitialPageJumpRequest, resolveInitialPdfViewState, usePdfSourceReset, usePdfVisibilityRestore, usePersistedPdfViewStateSync } from './pdfSystemControllerState';
import {
  clampInteger,
  createJumpRequest,
  PDF_PAGE_MIN,
  PDF_ZOOM_MAX,
  PDF_ZOOM_MIN,
  PDF_ZOOM_MODE_CUSTOM,
  PDF_ZOOM_MODE_FIT_WIDTH,
  PDF_ZOOM_STEP,
  resolvePdfSource
} from './pdfSystemStateUtils';
function usePdfSystemActions(
  page: number,
  maxPage: number,
  setLoadError: Dispatch<SetStateAction<string | null>>,
  setPage: Dispatch<SetStateAction<number>>,
  setPageJumpRequest: Dispatch<SetStateAction<PdfJumpRequest | null>>,
  setPositionY: Dispatch<SetStateAction<number>>,
  setPdfSource: Dispatch<SetStateAction<string>>,
  setRotation: Dispatch<SetStateAction<number>>,
  setTotalPages: Dispatch<SetStateAction<number | null>>,
  setZoom: Dispatch<SetStateAction<number>>,
  setZoomMode: Dispatch<SetStateAction<'custom' | 'fit-width'>>
) {
  const jumpRequestIdRef = useRef(1);

  return useMemo(
    () =>
      createPdfSystemActions({
        jumpRequestIdRef,
        maxPage,
        page,
        setLoadError,
        setPage,
        setPageJumpRequest,
        setPositionY,
        setPdfSource,
        setRotation,
        setTotalPages,
        setZoom,
        setZoomMode
      }),
    [maxPage, page, setLoadError, setPage, setPageJumpRequest, setPositionY, setPdfSource, setRotation, setTotalPages, setZoom, setZoomMode]
  );
}

function createPdfSystemActions(args: {
  jumpRequestIdRef: MutableRefObject<number>;
  maxPage: number;
  page: number;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setPageJumpRequest: Dispatch<SetStateAction<PdfJumpRequest | null>>;
  setPositionY: Dispatch<SetStateAction<number>>;
  setPdfSource: Dispatch<SetStateAction<string>>;
  setRotation: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number | null>>;
  setZoom: Dispatch<SetStateAction<number>>;
  setZoomMode: Dispatch<SetStateAction<'custom' | 'fit-width'>>;
}) {
  const queuePageJump = (jumpPage: number, positionY?: number) => {
    args.setPageJumpRequest(createJumpRequest(args.jumpRequestIdRef, jumpPage, positionY));
  };
  return {
    ...createPdfCoreActions(args),
    requestAnchorJump: (locator: NonNullable<NodeAnchorLink['locator']>) => {
      const nextPage = clampInteger(locator.page, PDF_PAGE_MIN, args.maxPage);
      args.setPage(nextPage);
      args.setPositionY(Math.max(0, Math.min(1, locator.y ?? 0)));
      queuePageJump(nextPage, locator.y);
    },
    requestPageChange: (value: number) => {
      const nextPage = clampInteger(value, PDF_PAGE_MIN, args.maxPage);
      args.setPage(nextPage);
      args.setPositionY(0);
      queuePageJump(nextPage);
    },
    setVisibleLocation: (visiblePage: number, positionY: number) => {
      const nextPage = clampInteger(visiblePage, PDF_PAGE_MIN, args.maxPage);
      args.setPage(nextPage);
      args.setPositionY(Math.max(0, Math.min(1, positionY)));
    },
    stepPage: (direction: -1 | 1) => {
      const nextPage = clampInteger(args.page + direction, PDF_PAGE_MIN, args.maxPage);
      args.setPage(nextPage);
      args.setPositionY(0);
      queuePageJump(nextPage);
    }
  };
}

function createPdfCoreActions(args: {
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setPageJumpRequest: Dispatch<SetStateAction<PdfJumpRequest | null>>;
  setPdfSource: Dispatch<SetStateAction<string>>;
  setRotation: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number | null>>;
  setZoom: Dispatch<SetStateAction<number>>;
  setZoomMode: Dispatch<SetStateAction<'custom' | 'fit-width'>>;
}) {
  return {
    clearPageJumpRequest: (requestId: number) => {
      args.setPageJumpRequest((current) => (current?.id === requestId ? null : current));
    },
    reportLoadError: (message: string | null) => {
      args.setLoadError(message);
    },
    reportLoadSuccess: (numPages: number) => {
      args.setLoadError(null);
      args.setTotalPages(numPages);
    },
    rotateClockwise: () => {
      args.setRotation((current) => (current + 90) % 360);
    },
    setFitWidth: () => {
      args.setZoomMode(PDF_ZOOM_MODE_FIT_WIDTH);
    },
    setZoom: (value: number) => {
      args.setZoomMode(PDF_ZOOM_MODE_CUSTOM);
      args.setZoom(clampInteger(value, PDF_ZOOM_MIN, PDF_ZOOM_MAX));
    },
    zoomIn: () => {
      args.setZoomMode(PDF_ZOOM_MODE_CUSTOM);
      args.setZoom((current) => Math.min(PDF_ZOOM_MAX, current + PDF_ZOOM_STEP));
    },
    zoomOut: () => {
      args.setZoomMode(PDF_ZOOM_MODE_CUSTOM);
      args.setZoom((current) => Math.max(PDF_ZOOM_MIN, current - PDF_ZOOM_STEP));
    }
  };
}

type PdfCoreStateResult = {
  loadError: string | null;
  maxPage: number;
  page: number;
  pageJumpRequest: PdfJumpRequest | null;
  pdfSource: string;
  positionY: number;
  rotation: number;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setPageJumpRequest: Dispatch<SetStateAction<PdfJumpRequest | null>>;
  setPositionY: Dispatch<SetStateAction<number>>;
  setPdfSource: Dispatch<SetStateAction<string>>;
  setRotation: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number | null>>;
  setZoom: Dispatch<SetStateAction<number>>;
  setZoomMode: Dispatch<SetStateAction<'custom' | 'fit-width'>>;
  totalPages: number | null;
  zoomMode: 'custom' | 'fit-width';
  zoom: number;
};

function usePdfCoreState(
  nodeViewState: NodeViewState | undefined,
  onPersistViewState: (viewState: NodeViewState) => void,
  sourceHint: string
): PdfCoreStateResult {
  const resolvedSource = useMemo(() => resolvePdfSource(sourceHint), [sourceHint]);
  const initialViewState = resolveInitialPdfViewState(nodeViewState);
  const [page, setPage] = useState(() => initialViewState.page);
  const [positionY, setPositionY] = useState(() => initialViewState.positionY);
  const [zoomMode, setZoomMode] = useState<'custom' | 'fit-width'>(() => initialViewState.zoomMode);
  const [zoom, setZoom] = useState(() => initialViewState.zoom);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [pdfSource, setPdfSource] = useState(() => resolvedSource);
  const [pageJumpRequest, setPageJumpRequest] = useState<PdfJumpRequest | null>(() => createInitialPageJumpRequest(initialViewState));
  usePdfSourceReset({
    initialViewState,
    resolvedSource,
    setLoadError,
    setPage,
    setPageJumpRequest,
    setPositionY,
    setPdfSource,
    setTotalPages,
    setZoom,
    setZoomMode
  });
  usePersistedPdfViewStateSync({ customZoom: zoom, page, positionY, zoomMode, onPersistViewState });

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
    positionY,
    rotation,
    setLoadError,
    setPage,
    setPageJumpRequest,
    setPositionY,
    setPdfSource,
    setRotation,
    setTotalPages,
    setZoom,
    setZoomMode,
    totalPages,
    zoomMode,
    zoom
  };
}

export function usePdfSystemController(
  nodeViewState: NodeViewState | undefined,
  onPersistViewState: (viewState: NodeViewState) => void,
  sourceHint: string,
  isVisible = true
): PdfSystemController {
  const coreState = usePdfCoreState(nodeViewState, onPersistViewState, sourceHint);
  const actions = usePdfSystemActions(
    coreState.page,
    coreState.maxPage,
    coreState.setLoadError,
    coreState.setPage,
    coreState.setPageJumpRequest,
    coreState.setPositionY,
    coreState.setPdfSource,
    coreState.setRotation,
    coreState.setTotalPages,
    coreState.setZoom,
    coreState.setZoomMode
  );
  usePdfVisibilityRestore({
    isVisible,
    page: coreState.page,
    positionY: coreState.positionY,
    setPageJumpRequest: coreState.setPageJumpRequest,
    totalPages: coreState.totalPages
  });

  return {
    actions,
    state: {
      loadError: coreState.loadError,
      maxPage: coreState.maxPage,
      page: coreState.page,
      pageJumpRequest: coreState.pageJumpRequest,
      pdfSource: coreState.pdfSource,
      positionY: coreState.positionY,
      rotation: coreState.rotation,
      totalPages: coreState.totalPages,
      zoomMode: coreState.zoomMode,
      zoom: coreState.zoom
    }
  };
}
