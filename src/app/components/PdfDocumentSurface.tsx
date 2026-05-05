import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';
import { pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { registerPdfSystem, unregisterPdfSystem } from '../../features/pdf/model/pdfSystemBridge';
import { usePdfSystemController } from '../../features/pdf/model/usePdfSystemController';
import { AppSelectionDropdownMenu, AppSelectionDropdownMenuItem } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';
import { normalizeContextMenuPosition } from '../contextCommands';

import type { PdfSearchRequest, PdfSearchStatus } from './PdfDocumentSearch';
import { PdfDocumentSurfaceLayout } from './PdfDocumentSurfaceLayout';
import { resolvePdfSelectionLocator, resolvePdfSelectionText } from './pdfSelectionText';

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
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  nodeId: string | null;
  onCreateHighlightFromSelection?: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onPersistViewState: (viewState: NodeViewState) => void;
  sourceHint: string;
  nodeViewState?: NodeViewState;
}

const CONTEXT_MENU_SELECTION_FALLBACK_WINDOW_MS = 1000;

interface PdfSelectionSnapshot {
  capturedAt: number;
  locator: NodeAnchorLink['locator'];
  selectionText: string;
}

function resolvePdfSelectionSnapshot(surface: HTMLElement | null): PdfSelectionSnapshot | null {
  const selection = window.getSelection();
  if (!selection) {
    return null;
  }
  const selectionText = resolvePdfSelectionText(surface, selection);
  if (!selectionText) {
    return null;
  }
  return {
    capturedAt: Date.now(),
    locator: resolvePdfSelectionLocator(surface, selection),
    selectionText
  };
}

function resolveFallbackSelection(snapshot: PdfSelectionSnapshot | null) {
  if (!snapshot) {
    return null;
  }
  return Date.now() - snapshot.capturedAt <= CONTEXT_MENU_SELECTION_FALLBACK_WINDOW_MS ? snapshot : null;
}

function resolveContextMenuSelection(surface: HTMLElement | null, preservedSelection: PdfSelectionSnapshot | null) {
  return resolvePdfSelectionSnapshot(surface) ?? resolveFallbackSelection(preservedSelection);
}

function useTrackPdfSelection(
  surfaceRef: MutableRefObject<HTMLElement | null>,
  preservedSelectionRef: MutableRefObject<PdfSelectionSnapshot | null>
) {
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const syncSelectionSnapshot = () => {
      const snapshot = resolvePdfSelectionSnapshot(surface);
      if (snapshot) {
        preservedSelectionRef.current = snapshot;
      }
    };

    const captureRightClickSelection = (event: MouseEvent) => {
      if (event.button === 2) {
        syncSelectionSnapshot();
      }
    };

    document.addEventListener('selectionchange', syncSelectionSnapshot);
    surface.addEventListener('mouseup', syncSelectionSnapshot, true);
    surface.addEventListener('keyup', syncSelectionSnapshot, true);
    surface.addEventListener('mousedown', captureRightClickSelection, true);
    return () => {
      document.removeEventListener('selectionchange', syncSelectionSnapshot);
      surface.removeEventListener('mouseup', syncSelectionSnapshot, true);
      surface.removeEventListener('keyup', syncSelectionSnapshot, true);
      surface.removeEventListener('mousedown', captureRightClickSelection, true);
    };
  }, [preservedSelectionRef, surfaceRef]);
}

function usePdfSelectionContextMenu(onCreateHighlightFromSelection?: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean) {
  const [selectionMenuState, setSelectionMenuState] = useState<{
    left: number;
    top: number;
    selectionText: string;
    locator: NodeAnchorLink['locator'];
  } | null>(null);
  const [selectionOverlayLocator, setSelectionOverlayLocator] = useState<NodeAnchorLink['locator']>(undefined);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const preservedSelectionRef = useRef<PdfSelectionSnapshot | null>(null);
  useTrackPdfSelection(surfaceRef, preservedSelectionRef);

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const fallbackSelection = resolveContextMenuSelection(surfaceRef.current, preservedSelectionRef.current);
    if (!fallbackSelection?.selectionText) {
      setSelectionMenuState(null);
      setSelectionOverlayLocator(undefined);
      return;
    }
    event.preventDefault();
    const position = normalizeContextMenuPosition(event.clientX, event.clientY);
    setSelectionMenuState({
      left: position.left,
      locator: fallbackSelection.locator,
      top: position.top,
      selectionText: fallbackSelection.selectionText
    });
    setSelectionOverlayLocator(fallbackSelection.locator);
  };

  const closeSelectionMenu = () => {
    setSelectionMenuState(null);
    setSelectionOverlayLocator(undefined);
  };

  const handleCreateHighlight = () => {
    if (!selectionMenuState?.selectionText) {
      closeSelectionMenu();
      return;
    }
    onCreateHighlightFromSelection?.(selectionMenuState.selectionText, selectionMenuState.locator);
    closeSelectionMenu();
  };

  return {
    closeSelectionMenu,
    handleContextMenu,
    handleCreateHighlight,
    selectionOverlayLocator,
    selectionMenuState,
    surfaceRef
  };
}

function PdfSelectionContextMenu({
  onClose,
  onCreateHighlight,
  state
}: {
  onClose: () => void;
  onCreateHighlight: () => void;
  state: { left: number; top: number } | null;
}) {
  if (!state) {
    return null;
  }

  return (
    <AppSelectionDropdownMenu left={state.left} onClose={onClose} top={state.top}>
      <AppSelectionDropdownMenuItem onClick={onCreateHighlight}>Highlight</AppSelectionDropdownMenuItem>
    </AppSelectionDropdownMenu>
  );
}

function useRegisterPdfSurface(
  nodeId: string | null,
  requestAnchorJump: (locator: NonNullable<NodeAnchorLink['locator']>) => void
) {
  useEffect(() => {
    if (!nodeId) {
      return;
    }
    registerPdfSystem(nodeId, { requestAnchorJump });
    return () => {
      unregisterPdfSystem(nodeId);
    };
  }, [nodeId, requestAnchorJump]);
}

function usePdfSearchControls() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRequest, setSearchRequest] = useState<PdfSearchRequest | null>(null);
  const [searchStatus, setSearchStatus] = useState<PdfSearchStatus>({ current: 0, hasQuery: false, total: 0 });
  const searchRequestIdRef = useRef(1);

  const handleSearchRequest = (direction: 'next' | 'previous') => {
    setSearchRequest({ direction, id: searchRequestIdRef.current });
    searchRequestIdRef.current += 1;
  };

  return { handleSearchRequest, searchQuery, searchRequest, searchStatus, setSearchQuery, setSearchStatus };
}

export function PdfDocumentSurface({ highlightLocators, nodeId, nodeViewState, onCreateHighlightFromSelection, onPersistViewState, sourceHint }: PdfDocumentSurfaceProps) {
  const {
    actions: {
      clearPageJumpRequest,
      reportLoadError,
      reportLoadSuccess,
      requestPageChange,
      requestAnchorJump,
      rotateClockwise,
      setVisiblePage,
      stepPage,
      zoomIn,
      zoomOut
    },
    state: { loadError, maxPage, page, pageJumpRequest, pdfSource, rotation, totalPages, zoom }
  } = usePdfSystemController(nodeViewState, onPersistViewState, sourceHint);
  const { closeSelectionMenu, handleContextMenu, handleCreateHighlight, selectionMenuState, selectionOverlayLocator, surfaceRef } = usePdfSelectionContextMenu(
    onCreateHighlightFromSelection
  );
  useRegisterPdfSurface(nodeId, requestAnchorJump);
  const { handleSearchRequest, searchQuery, searchRequest, searchStatus, setSearchQuery, setSearchStatus } = usePdfSearchControls();

  return (
    <PdfDocumentSurfaceLayout
      clearPageJumpRequest={clearPageJumpRequest}
      handleContextMenu={handleContextMenu}
      handleSearchRequest={handleSearchRequest}
      highlightLocators={highlightLocators}
      loadError={loadError}
      maxPage={maxPage}
      page={page}
      pageJumpRequest={pageJumpRequest}
      pdfSelectionLocator={selectionOverlayLocator}
      pdfSelectionContextMenu={
        <PdfSelectionContextMenu onClose={closeSelectionMenu} onCreateHighlight={handleCreateHighlight} state={selectionMenuState} />
      }
      pdfSource={pdfSource}
      reportLoadError={reportLoadError}
      reportLoadSuccess={reportLoadSuccess}
      requestPageChange={requestPageChange}
      rotateClockwise={rotateClockwise}
      searchQuery={searchQuery}
      searchRequest={searchRequest}
      searchStatus={searchStatus}
      setSearchQuery={setSearchQuery}
      setSearchStatus={setSearchStatus}
      setVisiblePage={setVisiblePage}
      stepPage={stepPage}
      surfaceRef={surfaceRef}
      totalPages={totalPages}
      zoom={zoom}
      zoomIn={zoomIn}
      zoomOut={zoomOut}
      rotation={rotation}
    />
  );
}
