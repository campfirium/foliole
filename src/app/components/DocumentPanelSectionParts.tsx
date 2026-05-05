import type { ComponentProps, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode } from '../../features/nodes/model/specialNodes';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { resolvePdfDocumentSurface } from './documentPanelPdfView';
import { resolveDocumentPanelContentBody } from './documentPanelSpecialContent';
import type { LinkPanelRecord } from './linkPanelState';
import { PdfDocumentSurfaceCache } from './PdfDocumentSurfaceCache';
import { collectPdfHighlightLocators, type PdfHighlightLocator } from './pdfHighlightLocators';
import { ReadwiseBookActionsPanel } from './ReadwiseBookActionsPanel';
import { useNodeSourceDetails } from './useNodeSourceDetails';

interface DocumentPanelContentProps {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  folderListSearchQuery: string;
  folderListSortDirection: FolderListSortDirection;
  folderListSortKey: FolderListSortKey;
  onChangeFolderListSearchQuery: (searchQuery: string) => void;
  onChangeFolderListSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeFolderListSortKey: (sortKey: FolderListSortKey) => void;
  isFolderListView: boolean;
  nodeOrder: string[];
  trashedNodeIds: string[];
  nodesById: Record<string, Node>;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  onSelectNode: (nodeId: string) => void;
  linkPanels: LinkPanelRecord[];
  onCloseExternalLink: (panelId: string) => void;
  onLinkPanelStateChange: (
    panelId: string,
    state: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>
  ) => void;
}

const PDF_READER_PLACEHOLDER_TEXT = 'Linked PDF source ready for the reader surface.';

function isLikelyPdfSourceReference(content: string) {
  const normalized = content.trim();
  if (normalized.includes(PDF_READER_PLACEHOLDER_TEXT)) {
    return true;
  }
  if (!normalized || !/[.][Pp][Dd][Ff](?:$|[?#\s)\]])/.test(normalized)) {
    return false;
  }
  const lineCount = normalized.split('\n').length;
  if (lineCount <= 6 && normalized.length <= 480) {
    return true;
  }
  return /(?:file:\/\/|[A-Za-z]:[\\/]|\/)/.test(normalized);
}

function createPdfCache(args: {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  pdfDocumentSurface: ReturnType<typeof resolvePdfDocumentSurface>;
  pdfHighlightLocators: ReturnType<typeof collectPdfHighlightLocators>;
  setIsActivePdfCachedVisible: (visible: boolean) => void;
}) {
  return (
    <>
      <PdfDocumentSurfaceCache
        activeNodeId={args.activeNodeId}
        activePersistedPageCount={args.pdfDocumentSurface?.state === 'ready'
          ? args.pdfDocumentSurface.details.pdfPageDimensions.reduce((maxPage, entry) => Math.max(maxPage, entry.page), 0) || null
          : null}
        activePersistedPageDimensions={
          args.pdfDocumentSurface?.state === 'ready'
            ? Object.fromEntries(
                args.pdfDocumentSurface.details.pdfPageDimensions.flatMap((entry) =>
                  typeof entry.pageWidth === 'number' &&
                  Number.isFinite(entry.pageWidth) &&
                  entry.pageWidth > 0 &&
                  typeof entry.pageHeight === 'number' &&
                  Number.isFinite(entry.pageHeight) &&
                  entry.pageHeight > 0
                    ? [[entry.page, { height: entry.pageHeight, width: entry.pageWidth }] as const]
                    : []
                )
              )
            : {}
        }
        activePdfState={args.pdfDocumentSurface?.state ?? null}
        activeSourceHint={args.pdfDocumentSurface?.sourceHint ?? null}
        editorNodeId={args.bodyProps.editorNodeId}
        editorNodeViewState={args.bodyProps.editorNodeViewState}
        highlightLocators={args.pdfHighlightLocators}
        onActiveCacheVisibilityChange={args.setIsActivePdfCachedVisible}
        onCreatePdfHighlight={args.onCreatePdfHighlight}
        onPersistPdfViewState={args.onPersistPdfViewState}
      />
      <ReadwiseBookActionsPanel activeNodeId={args.activeNodeId} />
    </>
  );
}

function getDocumentPanelFlags(args: {
  activeNode: Node | undefined;
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  isFolderListView: boolean;
  pdfDocumentSurface: ReturnType<typeof resolvePdfDocumentSurface>;
  sourceDetails: ReturnType<typeof useNodeSourceDetails>;
}) {
  return {
    shouldHideEditorBodyDuringSourceLoad:
      Boolean(
        args.activeNodeId &&
          args.activeNode &&
          !isVirtualNode(args.activeNode) &&
          !args.isFolderListView
      ) &&
      !args.pdfDocumentSurface &&
      args.sourceDetails.isLoading &&
      args.sourceDetails.value === null &&
      isLikelyPdfSourceReference(args.bodyProps.editorContent),
    shouldRenderEditorBody:
      !args.activeNode ||
      (!isVirtualNode(args.activeNode) &&
        !args.isFolderListView &&
      !args.pdfDocumentSurface)
  };
}

function useDocumentPanelContentState(args: {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  isFolderListView: boolean;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  const activeNode = args.activeNodeId ? args.nodesById[args.activeNodeId] : undefined;
  const shouldLoadSourceDetails = Boolean(
    args.activeNodeId && activeNode && !isVirtualNode(activeNode) && !args.isFolderListView
  );
  const sourceDetails = useNodeSourceDetails(shouldLoadSourceDetails ? args.activeNodeId : null);
  const pdfDocumentSurface = resolvePdfDocumentSurface(args.activeNodeId, sourceDetails.isLoading, sourceDetails.value);
  const pdfHighlightLocators = useMemo(() => {
    if (!args.activeNodeId || !pdfDocumentSurface) {
      return [];
    }
    return collectPdfHighlightLocators(
      args.activeNodeId,
      args.nodeOrder,
      args.nodesById,
      args.trashedNodeIds
    );
  }, [args.activeNodeId, args.nodeOrder, args.nodesById, args.trashedNodeIds, pdfDocumentSurface]);
  const documentFlags = getDocumentPanelFlags({
    activeNode,
    activeNodeId: args.activeNodeId,
    bodyProps: args.bodyProps,
    isFolderListView: args.isFolderListView,
    pdfDocumentSurface,
    sourceDetails
  });

  return {
    activeNode,
    pdfDocumentSurface,
    pdfHighlightLocators,
    ...documentFlags
  };
}

function useResetEditorReadyWhenHidden(
  bodyProps: ComponentProps<typeof DocumentPanelBody>,
  shouldRenderEditorBody: boolean
) {
  useEffect(() => {
    if (!shouldRenderEditorBody) {
      bodyProps.onEditorReady?.(null);
    }
  }, [bodyProps, shouldRenderEditorBody]);
}

function buildDocumentPanelContentBodyArgs(
  props: DocumentPanelContentProps,
  derived: {
    activeNode: Node | undefined;
    isActivePdfCachedVisible: boolean;
    contentAreaRef: RefObject<HTMLDivElement | null>;
    pdfCache: JSX.Element;
    pdfDocumentSurface: ReturnType<typeof resolvePdfDocumentSurface>;
    pdfHighlightLocators: PdfHighlightLocator[];
    shouldHideEditorBodyDuringSourceLoad: boolean;
  }
) {
  return {
    activeNode: derived.activeNode,
    activeNodeId: props.activeNodeId,
    bodyProps: props.bodyProps,
    folderListSearchQuery: props.folderListSearchQuery,
    folderListSortDirection: props.folderListSortDirection,
    folderListSortKey: props.folderListSortKey,
    onChangeFolderListSearchQuery: props.onChangeFolderListSearchQuery,
    onChangeFolderListSortDirection: props.onChangeFolderListSortDirection,
    onChangeFolderListSortKey: props.onChangeFolderListSortKey,
    isActivePdfCachedVisible: derived.isActivePdfCachedVisible,
    isFolderListView: props.isFolderListView,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    onCreatePdfHighlight: props.onCreatePdfHighlight,
    onNodeContentChange: props.onNodeContentChange,
    onOpenExternalLink: props.onOpenExternalLink,
    onPersistPdfViewState: props.onPersistPdfViewState,
    onSelectNode: props.onSelectNode,
    linkPanels: props.linkPanels,
    onCloseExternalLink: props.onCloseExternalLink,
    onLinkPanelStateChange: props.onLinkPanelStateChange,
    contentAreaRef: derived.contentAreaRef,
    pdfCache: derived.pdfCache,
    pdfDocumentSurface: derived.pdfDocumentSurface,
    pdfHighlightLocators: derived.pdfHighlightLocators,
    shouldHideEditorBodyDuringSourceLoad: derived.shouldHideEditorBodyDuringSourceLoad
  };
}

export function DocumentPanelContent(props: DocumentPanelContentProps) {
  const [isActivePdfCachedVisible, setIsActivePdfCachedVisible] = useState(false);
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const {
    activeNode,
    pdfDocumentSurface,
    pdfHighlightLocators,
    shouldHideEditorBodyDuringSourceLoad,
    shouldRenderEditorBody
  } = useDocumentPanelContentState({
    activeNodeId: props.activeNodeId,
    bodyProps: props.bodyProps,
    isFolderListView: props.isFolderListView,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    trashedNodeIds: props.trashedNodeIds
  });
  useResetEditorReadyWhenHidden(props.bodyProps, shouldRenderEditorBody);

  const pdfCache = createPdfCache({
    activeNodeId: props.activeNodeId,
    bodyProps: props.bodyProps,
    onCreatePdfHighlight: props.onCreatePdfHighlight,
    onPersistPdfViewState: props.onPersistPdfViewState,
    pdfDocumentSurface,
    pdfHighlightLocators,
    setIsActivePdfCachedVisible
  });

  return resolveDocumentPanelContentBody(
    buildDocumentPanelContentBodyArgs(props, {
      activeNode,
      isActivePdfCachedVisible,
      contentAreaRef,
      pdfCache,
      pdfDocumentSurface,
      pdfHighlightLocators,
      shouldHideEditorBodyDuringSourceLoad
    })
  );
}
