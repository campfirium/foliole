import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { NodeViewState } from '../../../store/workspaceStore';

import type { PdfJumpRequest } from './pdfSystemApi';
import {
  createPersistedPdfViewState,
  PDF_PAGE_MIN,
  resolveInitialCustomZoom,
  resolveInitialPage,
  resolveInitialPositionY,
  resolveInitialZoomMode
} from './pdfSystemStateUtils';

export interface InitialPdfViewState {
  page: number;
  positionY: number;
  zoom: number;
  zoomMode: 'custom' | 'fit-width';
}

export function resolveInitialPdfViewState(nodeViewState: NodeViewState | undefined): InitialPdfViewState {
  return {
    page: resolveInitialPage(nodeViewState),
    positionY: resolveInitialPositionY(nodeViewState),
    zoom: resolveInitialCustomZoom(nodeViewState),
    zoomMode: resolveInitialZoomMode(nodeViewState)
  };
}

export function createInitialPageJumpRequest(initialViewState: InitialPdfViewState): PdfJumpRequest | null {
  return initialViewState.page > PDF_PAGE_MIN || initialViewState.positionY > 0
    ? { id: 0, page: initialViewState.page, positionY: initialViewState.positionY }
    : null;
}

function shouldRestorePdfJump(page: number, positionY: number) {
  return page > PDF_PAGE_MIN || positionY > 0;
}

export function usePdfSourceReset(args: {
  initialViewState: InitialPdfViewState;
  initialTotalPages: number | null;
  resolvedSource: string;
  setLoadError: (value: string | null) => void;
  setPage: Dispatch<SetStateAction<number>>;
  setPageJumpRequest: Dispatch<SetStateAction<PdfJumpRequest | null>>;
  setPositionY: Dispatch<SetStateAction<number>>;
  setPdfSource: (value: string) => void;
  setTotalPages: (value: number | null) => void;
  setZoom: Dispatch<SetStateAction<number>>;
  setZoomMode: Dispatch<SetStateAction<'custom' | 'fit-width'>>;
}) {
  const lastResolvedSourceRef = useRef(args.resolvedSource);

  useEffect(() => {
    if (args.resolvedSource === lastResolvedSourceRef.current) {
      return;
    }
    lastResolvedSourceRef.current = args.resolvedSource;
    args.setLoadError(null);
    args.setTotalPages(args.initialTotalPages);
    args.setPage(args.initialViewState.page);
    args.setPageJumpRequest(createInitialPageJumpRequest(args.initialViewState));
    args.setPositionY(args.initialViewState.positionY);
    args.setPdfSource(args.resolvedSource);
    args.setZoom(args.initialViewState.zoom);
    args.setZoomMode(args.initialViewState.zoomMode);
  }, [args]);
}

export function usePersistedPdfViewStateSync(args: {
  customZoom: number;
  page: number;
  positionY: number;
  zoomMode: 'custom' | 'fit-width';
  onPersistViewState: (viewState: NodeViewState) => void;
}) {
  const onPersistViewStateRef = useRef(args.onPersistViewState);
  const lastSyncedViewRef = useRef<{
    customZoom: number;
    page: number;
    positionY: number;
    zoomMode: 'custom' | 'fit-width';
  } | null>(null);
  const didMountRef = useRef(false);

  useEffect(() => {
    onPersistViewStateRef.current = args.onPersistViewState;
  }, [args.onPersistViewState]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      lastSyncedViewRef.current = args;
      return;
    }
    if (
      lastSyncedViewRef.current &&
      lastSyncedViewRef.current.customZoom === args.customZoom &&
      lastSyncedViewRef.current.page === args.page &&
      lastSyncedViewRef.current.positionY === args.positionY &&
      lastSyncedViewRef.current.zoomMode === args.zoomMode
    ) {
      return;
    }
    lastSyncedViewRef.current = args;
    onPersistViewStateRef.current(
      createPersistedPdfViewState({
        customZoom: args.customZoom,
        page: args.page,
        positionY: args.positionY,
        zoomMode: args.zoomMode
      })
    );
  }, [args]);
}

export function usePdfVisibilityRestore(args: {
  isVisible: boolean;
  page: number;
  positionY: number;
  setPageJumpRequest: Dispatch<SetStateAction<PdfJumpRequest | null>>;
  totalPages: number | null;
}) {
  const restoreJumpIdRef = useRef(-1);
  const previousVisibleRef = useRef(args.isVisible);
  const previousTotalPagesRef = useRef(args.totalPages);

  useEffect(() => {
    const becameVisible = args.isVisible && !previousVisibleRef.current;
    const becameReadyWhileVisible = args.isVisible && !previousTotalPagesRef.current && Boolean(args.totalPages);
    previousVisibleRef.current = args.isVisible;
    previousTotalPagesRef.current = args.totalPages;
    if ((!becameVisible && !becameReadyWhileVisible) || !shouldRestorePdfJump(args.page, args.positionY)) {
      return;
    }
    args.setPageJumpRequest({ id: restoreJumpIdRef.current, page: args.page, positionY: args.positionY });
    restoreJumpIdRef.current -= 1;
  }, [args.isVisible, args.page, args.positionY, args.setPageJumpRequest, args.totalPages]);
}
