import type { ComponentProps, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode } from '../../features/nodes/model/specialNodes';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import type { NodeViewState } from '../../store/workspaceStore';
import type { CurrentViewTopicSnapshot } from '../currentViewTopicSnapshot';

import { DocumentPanelBody } from './DocumentPanelBody';
import { startDocumentPanelContentDiagnostic } from './documentPanelContentDiagnostic';
import { createDocumentPanelPdfCache } from './documentPanelPdfCache';
import { resolvePdfDocumentSurface } from './documentPanelPdfView';
import { resolveDocumentPanelContentBody } from './documentPanelSpecialContent';
import type { LinkPanelRecord } from './linkPanelState';
import { collectPdfHighlightLocators, type PdfHighlightLocator } from './pdfHighlightLocators';
import { useNodeSourceDetails } from './useNodeSourceDetails';

interface DocumentPanelContentProps {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  folderListSortDirection: FolderListSortDirection;
  folderListSortKey: FolderListSortKey;
  onChangeFolderListSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeFolderListSortKey: (sortKey: FolderListSortKey) => void;
  isFolderListView: boolean;
  isTrashViewOpen: boolean;
  nodeOrder: string[];
  trashedNodeIds: string[];
  nodesById: Record<string, Node>;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void;
  onOpenMoveToNode?: (sourceSnapshot?: CurrentViewTopicSnapshot[]) => void;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView?: (nodeId: string) => void;
  onSelectTrashNode?: ((nodeId: string) => void) | undefined;
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
  const withoutOptionalTitle = normalized.replace(/^# .+\n+/, '').trim();
  return /^(?:https?:\/\/|file:\/\/|[A-Za-z]:[\\/]|\/|\.{1,2}\/|[^:\n]+)[^\n]*[.][Pp][Dd][Ff](?:[?#][^\n\s)]*)?$/.test(
    withoutOptionalTitle
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
    folderListSortDirection: props.folderListSortDirection,
    folderListSortKey: props.folderListSortKey,
    onChangeFolderListSortDirection: props.onChangeFolderListSortDirection,
    onChangeFolderListSortKey: props.onChangeFolderListSortKey,
    isActivePdfCachedVisible: derived.isActivePdfCachedVisible,
    isFolderListView: props.isFolderListView,
    isTrashViewOpen: props.isTrashViewOpen,
    nodeOrder: props.nodeOrder,
    trashedNodeIds: props.trashedNodeIds,
    nodesById: props.nodesById,
    onCreatePdfHighlight: props.onCreatePdfHighlight,
    onNodeContentChange: props.onNodeContentChange,
    onOpenExternalLink: props.onOpenExternalLink,
    onOpenMoveToNode: props.onOpenMoveToNode,
    onPersistPdfViewState: props.onPersistPdfViewState,
    onSelectNode: props.onSelectNode,
    onSelectNodeInVirtualView: props.onSelectNodeInVirtualView ?? props.onSelectNode,
    onSelectTrashNode: props.onSelectTrashNode,
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
  const finishDiagnostic = startDocumentPanelContentDiagnostic(props);
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

  const pdfCache = createDocumentPanelPdfCache({
    activeNodeId: props.activeNodeId,
    bodyProps: props.bodyProps,
    onCreatePdfHighlight: props.onCreatePdfHighlight,
    onPersistPdfViewState: props.onPersistPdfViewState,
    pdfDocumentSurface,
    pdfHighlightLocators,
    setIsActivePdfCachedVisible
  });

  const content = resolveDocumentPanelContentBody(
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
  finishDiagnostic({ hasPdfSurface: Boolean(pdfDocumentSurface), shouldRenderEditorBody });
  return content;
}
