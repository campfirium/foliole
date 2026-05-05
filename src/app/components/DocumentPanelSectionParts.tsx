import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';

import { isImageClozeNode } from '../../features/image-cloze/model/imageCloze';
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
  onCreateImageCloze: () => void;
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
          !args.isFolderListView &&
          !isImageClozeNode(args.activeNode)
      ) &&
      !args.pdfDocumentSurface &&
      args.sourceDetails.isLoading &&
      args.sourceDetails.value === null &&
      isLikelyPdfSourceReference(args.bodyProps.editorContent),
    shouldRenderEditorBody:
      !args.activeNode ||
      (!isVirtualNode(args.activeNode) &&
        !args.isFolderListView &&
        !args.pdfDocumentSurface &&
        !isImageClozeNode(args.activeNode))
  };
}

export function DocumentPanelContent({
  activeNodeId,
  bodyProps,
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
  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const shouldLoadSourceDetails = Boolean(
    activeNodeId && activeNode && !isVirtualNode(activeNode) && !isFolderListView && !isImageClozeNode(activeNode)
  );
  const sourceDetails = useNodeSourceDetails(shouldLoadSourceDetails ? activeNodeId : null);
  const pdfDocumentSurface = resolvePdfDocumentSurface(activeNodeId, sourceDetails.isLoading, sourceDetails.value);
  const pdfHighlightLocators = activeNodeId ? collectPdfHighlightLocators(activeNodeId, nodeOrder, nodesById, trashedNodeIds) : [];
  const { shouldHideEditorBodyDuringSourceLoad, shouldRenderEditorBody } = getDocumentPanelFlags({
    activeNode,
    activeNodeId,
    bodyProps,
    isFolderListView,
    pdfDocumentSurface,
    sourceDetails
  });

  useEffect(() => {
    if (!shouldRenderEditorBody) {
      bodyProps.onEditorReady?.(null);
    }
  }, [bodyProps, shouldRenderEditorBody]);

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
  onCreateImageCloze,
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
      onCreateImageCloze={onCreateImageCloze}
      onCutImage={onCutImage}
      onDeleteImage={onDeleteImage}
      onExportImage={onExportImage}
      top={contextMenu.top}
    />
  );
}
