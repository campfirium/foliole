import { useEffect, type ComponentProps, type RefObject } from 'react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import type { PdfAnchorLocator } from '../../features/nodes/model/nodeTypes';
import { configurePdfWorker } from '../../features/pdf/model/pdfWorker';
import { usePdfSystemController } from '../../features/pdf/model/usePdfSystemController';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import { markNodePositionReady } from '../../shared/platform/performanceDiagnosticsProbe';
import type { NodeViewState } from '../../store/workspaceStore';

import { DOCUMENT_TOPIC_SEARCH_OPEN_EVENT } from './documentTopicSearchEvents';
import { PdfDocumentSurfaceLayout } from './PdfDocumentSurfaceLayout';
import { resolvePdfExternalHref } from './pdfExternalLinkTarget';
import type { PdfHighlightLocator } from './pdfHighlightLocators';
import type { PdfPageDimensions } from './pdfPageDimensions';
import { PdfSelectionContextMenu, usePdfSelectionContextMenu } from './PdfSelectionContextMenu';
import { useRegisterPdfSurface } from './pdfSurfaceRegistration';
import { usePdfSearchControls } from './pdfSurfaceSearchControls';
import { PdfVisualExcerptRuntimeProvider } from './PdfVisualExcerptRuntime';

configurePdfWorker();

function usePdfFindCommand(surfaceRef: RefObject<HTMLElement | null>, isVisible: boolean) {
  useEffect(() => {
    if (!isVisible) return undefined;
    const focusSearch = () => surfaceRef.current
      ?.querySelector<HTMLInputElement>('[data-pdf-search-input="true"]')
      ?.focus();
    window.addEventListener(DOCUMENT_TOPIC_SEARCH_OPEN_EVENT, focusSearch);
    return () => window.removeEventListener(DOCUMENT_TOPIC_SEARCH_OPEN_EVENT, focusSearch);
  }, [isVisible, surfaceRef]);
}

interface PdfDocumentSurfaceProps {
  highlightLocators: PdfHighlightLocator[];
  isVisible?: boolean;
  nodeId: string | null;
  onCreateHighlightFromSelection?: (selectionText: string, locator: PdfAnchorLocator) => boolean;
  onOpenExternalLink?: (request: ExternalLinkOpenRequest) => void;
  onPersistViewState: (viewState: NodeViewState) => void;
  persistedPageCount: number | null;
  persistedPageDimensions: Record<number, PdfPageDimensions>;
  pdfIndexStatus: 'failed' | 'indexing' | 'pending' | 'ready' | null;
  sourceHint: string;
  nodeViewState?: NodeViewState;
}

type PdfSurfaceLayoutProps = ComponentProps<typeof PdfDocumentSurfaceLayout>;

export function PdfDocumentSurface({
  highlightLocators,
  isVisible = true,
  nodeId,
  nodeViewState,
  onCreateHighlightFromSelection,
  onOpenExternalLink,
  onPersistViewState,
  persistedPageCount,
  persistedPageDimensions,
  pdfIndexStatus,
  sourceHint
}: PdfDocumentSurfaceProps) {
  const t = useTranslation();
  const pdfSystem = usePdfSystemController(nodeViewState, onPersistViewState, sourceHint, isVisible, persistedPageCount);
  const selectionState = usePdfSelectionContextMenu({
    nodeId,
    onCreateHighlightFromSelection
  });
  const searchState = usePdfSearchControls();
  usePdfFindCommand(selectionState.surfaceRef, isVisible);
  useRegisterPdfSurface(
    nodeId,
    pdfSystem.actions.requestAnchorJump,
    searchState.applyExternalSearch,
    selectionState.requestAnnotation,
    isVisible
  );

  const searchIndexingHint = searchState.searchQuery.trim()
    ? resolvePdfSearchIndexHint(pdfIndexStatus, t)
    : null;

  const textHighlightLocators = highlightLocators.filter((locator) => locator.kind === 'highlight');
  const layoutProps = {
    ...buildPdfSurfaceLayoutProps(nodeId, pdfIndexStatus, textHighlightLocators, pdfSystem, selectionState, searchState, searchIndexingHint, onOpenExternalLink),
    persistedPageCount,
    persistedPageDimensions
  };

  return (
    <PdfVisualExcerptRuntimeProvider
      currentPage={pdfSystem.state.page}
      locators={highlightLocators}
      nodeId={nodeId}
      rotation={pdfSystem.state.rotation}
      source={pdfSystem.state.pdfSource}
    >
      <PdfDocumentSurfaceLayout {...layoutProps} />
    </PdfVisualExcerptRuntimeProvider>
  );
}

function resolvePdfSearchIndexHint(
  status: PdfDocumentSurfaceProps['pdfIndexStatus'],
  t: ReturnType<typeof useTranslation>
) {
  if (status === 'pending' || status === 'indexing') return t('desktop.pdf.search.indexing');
  if (status === 'failed') return t('desktop.pdf.search.indexUnavailable');
  return null;
}

function buildPdfSurfaceLayoutProps(
  nodeId: string | null,
  pdfIndexStatus: PdfDocumentSurfaceProps['pdfIndexStatus'],
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>,
  pdfSystem: ReturnType<typeof usePdfSystemController>,
  selectionState: ReturnType<typeof usePdfSelectionContextMenu>,
  searchState: ReturnType<typeof usePdfSearchControls>,
  searchIndexingHint: string | null,
  onOpenExternalLink?: (request: ExternalLinkOpenRequest) => void
): PdfSurfaceLayoutProps {
  return {
    ...resolvePdfSurfaceHandlers(nodeId, pdfSystem, selectionState, searchState, onOpenExternalLink),
    highlightLocators,
    nodeId,
    pdfIndexStatus,
    pdfSelectionContextMenu: renderPdfSelectionMenu(selectionState),
    searchIndexingHint
  };
}

function renderPdfSelectionMenu(selectionState: ReturnType<typeof usePdfSelectionContextMenu>) {
  return (
    <PdfSelectionContextMenu
      onCreateHighlight={selectionState.handleCreateHighlight}
      onCreateCloze={selectionState.handleCreateCloze}
      onCreateNote={selectionState.handleCreateNote}
      noteDraft={selectionState.noteDraft}
      noteOpen={selectionState.noteOpen}
      setNoteDraft={selectionState.setNoteDraft}
      setNoteOpen={selectionState.setNoteOpen}
      state={selectionState.selectionMenuState}
    />
  );
}

function createPdfExternalLinkHandler(
  onOpenExternalLink?: (request: ExternalLinkOpenRequest) => void
): PdfSurfaceLayoutProps['handleExternalLinkClick'] {
  return (event) => {
    const href = resolvePdfExternalHref(event.target);
    if (!href) {
      return;
    }
    event.preventDefault();
    onOpenExternalLink?.({
      anchorPoint: { x: event.clientX, y: event.clientY },
      href
    });
  };
}

function resolvePdfSurfaceHandlers(
  nodeId: string | null,
  pdfSystem: ReturnType<typeof usePdfSystemController>,
  selectionState: ReturnType<typeof usePdfSelectionContextMenu>,
  searchState: ReturnType<typeof usePdfSearchControls>,
  onOpenExternalLink?: (request: ExternalLinkOpenRequest) => void
) {
  return {
    clearPageJumpRequest: (requestId: number) => {
      pdfSystem.actions.clearPageJumpRequest(requestId);
      if (nodeId) {
        markNodePositionReady(nodeId);
      }
    },
    handleContextMenu: selectionState.handleContextMenu,
    handleExternalLinkClick: createPdfExternalLinkHandler(onOpenExternalLink),
    handleSearchRequest: searchState.handleSearchRequest,
    handleSearchRequestHandled: searchState.handleSearchRequestHandled,
    handleSearchTargetHandled: searchState.handleSearchTargetHandled,
    loadError: pdfSystem.state.loadError,
    maxPage: pdfSystem.state.maxPage,
    page: pdfSystem.state.page,
    pageJumpRequest: pdfSystem.state.pageJumpRequest,
    persistedPageCount: null,
    persistedPageDimensions: {},
    pdfSelectionLocator: selectionState.selectionOverlayLocator,
    pdfSource: pdfSystem.state.pdfSource,
    reportLoadError: pdfSystem.actions.reportLoadError,
    reportLoadSuccess: pdfSystem.actions.reportLoadSuccess,
    requestPageChange: pdfSystem.actions.requestPageChange,
    rotateClockwise: pdfSystem.actions.rotateClockwise,
    rotation: pdfSystem.state.rotation,
    searchQuery: searchState.searchQuery,
    searchRequest: searchState.searchRequest,
    searchStatus: searchState.searchStatus,
    searchTarget: searchState.searchTarget,
    setSearchQuery: searchState.handleSearchQueryChange,
    setSearchStatus: searchState.setSearchStatus,
    setFitWidth: pdfSystem.actions.setFitWidth,
    setZoom: pdfSystem.actions.setZoom,
    setVisibleLocation: pdfSystem.actions.setVisibleLocation,
    stepPage: pdfSystem.actions.stepPage,
    surfaceRef: selectionState.surfaceRef,
    totalPages: pdfSystem.state.totalPages,
    zoomMode: pdfSystem.state.zoomMode,
    zoom: pdfSystem.state.zoom,
    zoomIn: pdfSystem.actions.zoomIn,
    zoomOut: pdfSystem.actions.zoomOut
  };
}
