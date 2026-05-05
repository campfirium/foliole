import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { NodeViewState } from '../../../store/workspaceStore';

import { usePdfSystemActions } from './pdfSystemActions';
import type { PdfJumpRequest, PdfSystemController } from './pdfSystemApi';
import { createInitialPageJumpRequest, resolveInitialPdfViewState, usePdfSourceReset, usePdfVisibilityRestore, usePersistedPdfViewStateSync } from './pdfSystemControllerState';
import { clampInteger, PDF_PAGE_MIN, resolvePdfSource } from './pdfSystemStateUtils';

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
  sourceHint: string,
  persistedPageCount: number | null
): PdfCoreStateResult {
  const resolvedSource = useMemo(() => resolvePdfSource(sourceHint), [sourceHint]);
  const initialViewState = resolveInitialPdfViewState(nodeViewState);
  const [page, setPage] = useState(() => initialViewState.page);
  const [positionY, setPositionY] = useState(() => initialViewState.positionY);
  const [zoomMode, setZoomMode] = useState<'custom' | 'fit-width'>(() => initialViewState.zoomMode);
  const [zoom, setZoom] = useState(() => initialViewState.zoom);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(persistedPageCount);
  const [rotation, setRotation] = useState(0);
  const [pdfSource, setPdfSource] = useState(() => resolvedSource);
  const [pageJumpRequest, setPageJumpRequest] = useState<PdfJumpRequest | null>(() => createInitialPageJumpRequest(initialViewState));
  usePdfSourceReset({
    initialViewState,
    initialTotalPages: persistedPageCount,
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
  isVisible = true,
  persistedPageCount: number | null = null
): PdfSystemController {
  const coreState = usePdfCoreState(nodeViewState, onPersistViewState, sourceHint, persistedPageCount);
  const actions = usePdfSystemActions({
    maxPage: coreState.maxPage,
    page: coreState.page,
    setLoadError: coreState.setLoadError,
    setPage: coreState.setPage,
    setPageJumpRequest: coreState.setPageJumpRequest,
    setPositionY: coreState.setPositionY,
    setPdfSource: coreState.setPdfSource,
    setRotation: coreState.setRotation,
    setTotalPages: coreState.setTotalPages,
    setZoom: coreState.setZoom,
    setZoomMode: coreState.setZoomMode
  });
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
