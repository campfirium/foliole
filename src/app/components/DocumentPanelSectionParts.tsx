import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';

import type { FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode } from '../../features/nodes/model/specialNodes';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { resolvePdfDocumentSurface } from './documentPanelPdfView';
import { resolveDocumentPanelContentBody } from './documentPanelSpecialContent';
import { EditorContextMenu } from './EditorContextMenu';
import { PdfDocumentSurfaceCache } from './PdfDocumentSurfaceCache';
import { collectPdfHighlightLocators } from './pdfHighlightLocators';
import { ReadwiseBookActionsPanel } from './ReadwiseBookActionsPanel';
import { useNodeSourceDetails } from './useNodeSourceDetails';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

interface DocumentPanelContentProps {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  folderListSortKey: FolderListSortKey;
  isFolderListView: boolean;
  nodeOrder: string[];
  trashedNodeIds: string[];
  nodesById: Record<string, Node>;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  onSelectNode: (nodeId: string) => void;
}

interface DocumentPanelContextMenuProps {
  contextMenu: WorkspaceEditorContextMenu | null;
  onCloseContextMenu: () => void;
  onCopyImage: () => void;
  onCreateHighlight: () => void;
  onCreateCloze: () => void;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onExportImage: () => void;
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
  const pdfHighlightLocators = args.activeNodeId
    ? collectPdfHighlightLocators(args.activeNodeId, args.nodeOrder, args.nodesById, args.trashedNodeIds)
    : [];
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

export function DocumentPanelContent({
  activeNodeId,
  bodyProps,
  folderListSortKey,
  isFolderListView,
  nodeOrder,
  trashedNodeIds,
  nodesById,
  onCreatePdfHighlight,
  onNodeContentChange,
  onPersistPdfViewState,
  onSelectNode
}: DocumentPanelContentProps) {
  const [isActivePdfCachedVisible, setIsActivePdfCachedVisible] = useState(false);
  const {
    activeNode,
    pdfDocumentSurface,
    pdfHighlightLocators,
    shouldHideEditorBodyDuringSourceLoad,
    shouldRenderEditorBody
  } = useDocumentPanelContentState({
    activeNodeId,
    bodyProps,
    isFolderListView,
    nodeOrder,
    nodesById,
    trashedNodeIds
  });
  useResetEditorReadyWhenHidden(bodyProps, shouldRenderEditorBody);

  const pdfCache = createPdfCache({
    activeNodeId,
    bodyProps,
    onCreatePdfHighlight,
    onPersistPdfViewState,
    pdfDocumentSurface,
    pdfHighlightLocators,
    setIsActivePdfCachedVisible
  });

  return resolveDocumentPanelContentBody({
    activeNode,
    activeNodeId,
    bodyProps,
    folderListSortKey,
    isActivePdfCachedVisible,
    isFolderListView,
    nodeOrder,
    nodesById,
    onCreatePdfHighlight,
    onNodeContentChange,
    onPersistPdfViewState,
    onSelectNode,
    pdfCache,
    pdfDocumentSurface,
    pdfHighlightLocators,
    shouldHideEditorBodyDuringSourceLoad
  });
}

export function DocumentPanelContextMenu({
  contextMenu,
  onCloseContextMenu,
  onCopyImage,
  onCreateHighlight,
  onCreateCloze,
  onCutImage,
  onDeleteImage,
  onExportImage
}: DocumentPanelContextMenuProps) {
  if (!contextMenu) {
    return null;
  }

  return (
    <EditorContextMenu
      canRunCommands={contextMenu.canRunCommands}
      kind={contextMenu.kind}
      left={contextMenu.left}
      onClose={onCloseContextMenu}
      onCopyImage={onCopyImage}
      onCreateCloze={onCreateCloze}
      onCreateHighlight={onCreateHighlight}
      onCutImage={onCutImage}
      onDeleteImage={onDeleteImage}
      onExportImage={onExportImage}
      top={contextMenu.top}
    />
  );
}
