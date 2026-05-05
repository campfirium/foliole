import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { NodeViewState } from '../../../store/workspaceStore';
import type { NodeAnchorLink } from '../../nodes/model/nodeTypes';

import type { PdfJumpRequest, PdfSystemController } from './pdfSystemApi';
import {
  clampInteger,
  createJumpRequest,
  PDF_PAGE_MIN,
  PDF_ZOOM_MAX,
  PDF_ZOOM_MIN,
  PDF_ZOOM_STEP,
  resolveInitialPage,
  resolveInitialZoom,
  resolvePdfSource
} from './pdfSystemStateUtils';

function useSourceReset(
  resolvedSource: string,
  setLoadError: (value: string | null) => void,
  setPageJumpRequest: Dispatch<SetStateAction<PdfJumpRequest | null>>,
  setPdfSource: (value: string) => void,
  setTotalPages: (value: number | null) => void
) {
  const lastResolvedSourceRef = useRef(resolvedSource);
  useEffect(() => {
    if (resolvedSource === lastResolvedSourceRef.current) {
      return;
    }
    lastResolvedSourceRef.current = resolvedSource;
    setLoadError(null);
    setTotalPages(null);
    setPageJumpRequest(null);
    setPdfSource(resolvedSource);
  }, [resolvedSource, setLoadError, setPageJumpRequest, setPdfSource, setTotalPages]);
}

function useViewStateSync(page: number, zoom: number, onPersistViewState: (viewState: NodeViewState) => void) {
  const onPersistViewStateRef = useRef(onPersistViewState);
  const lastSyncedViewRef = useRef<{ page: number; zoom: number } | null>(null);
  const didMountRef = useRef(false);

  useEffect(() => {
    onPersistViewStateRef.current = onPersistViewState;
  }, [onPersistViewState]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      lastSyncedViewRef.current = { page, zoom };
      return;
    }
    if (lastSyncedViewRef.current && lastSyncedViewRef.current.page === page && lastSyncedViewRef.current.zoom === zoom) {
      return;
    }
    lastSyncedViewRef.current = { page, zoom };
    onPersistViewStateRef.current({
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
    () =>
      createPdfSystemActions({
        jumpRequestIdRef,
        maxPage,
        page,
        setLoadError,
        setPage,
        setPageJumpRequest,
        setPdfSource,
        setRotation,
        setTotalPages,
        setZoom
      }),
    [maxPage, page, setLoadError, setPage, setPageJumpRequest, setPdfSource, setRotation, setTotalPages, setZoom]
  );
}

function createPdfSystemActions(args: {
  jumpRequestIdRef: MutableRefObject<number>;
  maxPage: number;
  page: number;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setPageJumpRequest: Dispatch<SetStateAction<PdfJumpRequest | null>>;
  setPdfSource: Dispatch<SetStateAction<string>>;
  setRotation: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number | null>>;
  setZoom: Dispatch<SetStateAction<number>>;
}) {
  const queuePageJump = (jumpPage: number, positionY?: number) => {
    args.setPageJumpRequest(createJumpRequest(args.jumpRequestIdRef, jumpPage, positionY));
  };
  return {
    ...createPdfCoreActions(args),
    requestAnchorJump: (locator: NonNullable<NodeAnchorLink['locator']>) => {
      const nextPage = clampInteger(locator.page, PDF_PAGE_MIN, args.maxPage);
      args.setPage(nextPage);
      queuePageJump(nextPage, locator.y);
    },
    requestPageChange: (value: number) => {
      const nextPage = clampInteger(value, PDF_PAGE_MIN, args.maxPage);
      args.setPage(nextPage);
      queuePageJump(nextPage);
    },
    setVisiblePage: (visiblePage: number) => {
      const nextPage = clampInteger(visiblePage, PDF_PAGE_MIN, args.maxPage);
      args.setPage(nextPage);
    },
    stepPage: (direction: -1 | 1) => {
      const nextPage = clampInteger(args.page + direction, PDF_PAGE_MIN, args.maxPage);
      args.setPage(nextPage);
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
    zoomIn: () => {
      args.setZoom((current) => Math.min(PDF_ZOOM_MAX, current + PDF_ZOOM_STEP));
    },
    zoomOut: () => {
      args.setZoom((current) => Math.max(PDF_ZOOM_MIN, current - PDF_ZOOM_STEP));
    }
  };
}

function usePdfCoreState(
  nodeViewState: NodeViewState | undefined,
  onPersistViewState: (viewState: NodeViewState) => void,
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
  const resolvedSource = useMemo(() => resolvePdfSource(sourceHint), [sourceHint]);
  const [page, setPage] = useState(() => resolveInitialPage(nodeViewState));
  const [zoom, setZoom] = useState(() => resolveInitialZoom(nodeViewState));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [pdfSource, setPdfSource] = useState(() => resolvedSource);
  const [pageJumpRequest, setPageJumpRequest] = useState<PdfJumpRequest | null>(null);
  useSourceReset(resolvedSource, setLoadError, setPageJumpRequest, setPdfSource, setTotalPages);
  useViewStateSync(page, zoom, onPersistViewState);

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
  onPersistViewState: (viewState: NodeViewState) => void,
  sourceHint: string
): PdfSystemController {
  const coreState = usePdfCoreState(nodeViewState, onPersistViewState, sourceHint);
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
