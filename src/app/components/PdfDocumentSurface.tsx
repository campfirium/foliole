import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';
import { pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { usePdfSystemController } from '../../features/pdf/model/usePdfSystemController';
import { AppSelectionDropdownMenu, AppSelectionDropdownMenuItem } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';
import { normalizeContextMenuPosition } from '../contextCommands';

import { PdfDocumentSurfaceLayout } from './PdfDocumentSurfaceLayout';
import { resolvePdfSelectionLocator, resolvePdfSelectionText } from './pdfSelectionText';
import { useRegisterPdfSurface } from './pdfSurfaceRegistration';
import { usePdfSearchControls } from './pdfSurfaceSearchControls';

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
  pdfIndexStatus: 'failed' | 'indexing' | 'pending' | 'ready' | null;
  sourceHint: string;
  nodeViewState?: NodeViewState;
}

type PdfSurfaceLayoutProps = ComponentProps<typeof PdfDocumentSurfaceLayout>;

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

export function PdfDocumentSurface({
  highlightLocators,
  nodeId,
  nodeViewState,
  onCreateHighlightFromSelection,
  onPersistViewState,
  pdfIndexStatus,
  sourceHint
}: PdfDocumentSurfaceProps) {
  const pdfSystem = usePdfSystemController(nodeViewState, onPersistViewState, sourceHint);
  const selectionState = usePdfSelectionContextMenu(onCreateHighlightFromSelection);
  const searchState = usePdfSearchControls();
  useRegisterPdfSurface(nodeId, pdfSystem.actions.requestAnchorJump, searchState.applyExternalSearch);

  const searchIndexingHint = searchState.searchQuery.trim() && (pdfIndexStatus === 'pending' || pdfIndexStatus === 'indexing')
    ? 'Indexing in progress'
    : null;

  const layoutProps = buildPdfSurfaceLayoutProps(highlightLocators, pdfSystem, selectionState, searchState, searchIndexingHint);

  return (
    <PdfDocumentSurfaceLayout {...layoutProps} />
  );
}

function buildPdfSurfaceLayoutProps(
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>,
  pdfSystem: ReturnType<typeof usePdfSystemController>,
  selectionState: ReturnType<typeof usePdfSelectionContextMenu>,
  searchState: ReturnType<typeof usePdfSearchControls>,
  searchIndexingHint: string | null
): PdfSurfaceLayoutProps {
  const selectionMenu = (
    <PdfSelectionContextMenu
      onClose={selectionState.closeSelectionMenu}
      onCreateHighlight={selectionState.handleCreateHighlight}
      state={selectionState.selectionMenuState}
    />
  );

  return {
    clearPageJumpRequest: pdfSystem.actions.clearPageJumpRequest,
    handleContextMenu: selectionState.handleContextMenu,
    handleSearchRequest: searchState.handleSearchRequest,
    highlightLocators,
    loadError: pdfSystem.state.loadError,
    maxPage: pdfSystem.state.maxPage,
    page: pdfSystem.state.page,
    pageJumpRequest: pdfSystem.state.pageJumpRequest,
    pdfSelectionLocator: selectionState.selectionOverlayLocator,
    pdfSelectionContextMenu: selectionMenu,
    pdfSource: pdfSystem.state.pdfSource,
    reportLoadError: pdfSystem.actions.reportLoadError,
    reportLoadSuccess: pdfSystem.actions.reportLoadSuccess,
    requestPageChange: pdfSystem.actions.requestPageChange,
    rotateClockwise: pdfSystem.actions.rotateClockwise,
    rotation: pdfSystem.state.rotation,
    searchIndexingHint,
    searchQuery: searchState.searchQuery,
    searchRequest: searchState.searchRequest,
    searchStatus: searchState.searchStatus,
    searchTarget: searchState.searchTarget,
    setSearchQuery: searchState.handleSearchQueryChange,
    setSearchStatus: searchState.setSearchStatus,
    setVisiblePage: pdfSystem.actions.setVisiblePage,
    stepPage: pdfSystem.actions.stepPage,
    surfaceRef: selectionState.surfaceRef,
    totalPages: pdfSystem.state.totalPages,
    zoom: pdfSystem.state.zoom,
    zoomIn: pdfSystem.actions.zoomIn,
    zoomOut: pdfSystem.actions.zoomOut
  };
}
