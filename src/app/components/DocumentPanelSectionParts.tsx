import type { ComponentProps } from 'react';
import { useState } from 'react';

import { VirtualNodeDetailView } from '../../features/nodes/components/VirtualNodeDetailView';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode } from '../../features/nodes/model/specialNodes';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { resolvePdfDocumentSurface, renderPdfDocumentSurface, type PdfDocumentSurfaceState } from './documentPanelPdfView';
import { EditorContextMenu } from './EditorContextMenu';
import { FolderListView } from './FolderListView';
import { PdfDocumentSurfaceCache } from './PdfDocumentSurfaceCache';
import { collectPdfHighlightLocators, type PdfHighlightLocator } from './pdfHighlightLocators';
import { ReadwiseBookActionsPanel } from './ReadwiseBookActionsPanel';
import { useNodeSourceDetails } from './useNodeSourceDetails';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

interface DocumentPanelContentProps {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  isFolderListView: boolean;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onPersistPdfViewState: (viewState: NodeViewState) => void;
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

function renderDocumentBody(activeNodeId: string | null, bodyProps: ComponentProps<typeof DocumentPanelBody>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="document-panel-content-body">
      <ReadwiseBookActionsPanel activeNodeId={activeNodeId} />
      <DocumentPanelBody {...bodyProps} />
    </div>
  );
}

function renderVirtualContent(
  activeNode: Node,
  nodesById: Record<string, Node>,
  onNodeContentChange: (nodeId: string, content: string) => void,
  onSelectNode: (nodeId: string) => void,
  pdfCache: JSX.Element
) {
  return (
    <>
      {pdfCache}
      <VirtualNodeDetailView node={activeNode} nodesById={nodesById} onSelectNode={onSelectNode} onUpdateFilter={onNodeContentChange} />
    </>
  );
}

function renderFolderContent(
  activeNodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  onSelectNode: (nodeId: string) => void,
  pdfCache: JSX.Element
) {
  return (
    <>
      {pdfCache}
      <FolderListView folderNodeId={activeNodeId} nodeOrder={nodeOrder} nodesById={nodesById} onSelectNode={onSelectNode} />
    </>
  );
}

function renderPdfOrBodyContent(args: {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  isActivePdfCachedVisible: boolean;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onPersistPdfViewState: (viewState: NodeViewState) => void;
  pdfCache: JSX.Element;
  pdfDocumentSurface: { sourceHint: string | null; state: PdfDocumentSurfaceState } | null;
  pdfHighlightLocators: PdfHighlightLocator[];
}) {
  if (!args.pdfDocumentSurface) {
    return (
      <>
        {args.pdfCache}
        {renderDocumentBody(args.activeNodeId, args.bodyProps)}
      </>
    );
  }

  return (
    <>
      {args.pdfCache}
      {!args.isActivePdfCachedVisible
        ? renderPdfDocumentSurface(
            args.pdfDocumentSurface,
            { editorNodeId: args.bodyProps.editorNodeId, editorNodeViewState: args.bodyProps.editorNodeViewState },
            args.pdfHighlightLocators,
            args.onCreatePdfHighlight,
            args.onPersistPdfViewState
          )
        : null}
    </>
  );
}

export function DocumentPanelContent({
  activeNodeId,
  bodyProps,
  isFolderListView,
  nodeOrder,
  nodesById,
  onCreatePdfHighlight,
  onNodeContentChange,
  onPersistPdfViewState,
  onSelectNode
}: DocumentPanelContentProps) {
  const [isActivePdfCachedVisible, setIsActivePdfCachedVisible] = useState(false);
  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const shouldLoadSourceDetails = Boolean(activeNodeId && activeNode && !isVirtualNode(activeNode) && !isFolderListView);
  const sourceDetails = useNodeSourceDetails(shouldLoadSourceDetails ? activeNodeId : null);
  const pdfDocumentSurface = resolvePdfDocumentSurface(sourceDetails.isLoading, sourceDetails.value);
  const pdfHighlightLocators = activeNodeId ? collectPdfHighlightLocators(activeNodeId, nodeOrder, nodesById) : [];

  const pdfCache = (
    <PdfDocumentSurfaceCache
      activeNodeId={activeNodeId}
      activePdfState={pdfDocumentSurface?.state ?? null}
      activeSourceHint={pdfDocumentSurface?.sourceHint ?? null}
      editorNodeId={bodyProps.editorNodeId}
      editorNodeViewState={bodyProps.editorNodeViewState}
      highlightLocators={pdfHighlightLocators}
      onActiveCacheVisibilityChange={setIsActivePdfCachedVisible}
      onCreatePdfHighlight={onCreatePdfHighlight}
      onPersistPdfViewState={onPersistPdfViewState}
    />
  );

  if (activeNode && isVirtualNode(activeNode)) {
    return renderVirtualContent(activeNode, nodesById, onNodeContentChange, onSelectNode, pdfCache);
  }
  if (isFolderListView && activeNodeId) {
    return renderFolderContent(activeNodeId, nodeOrder, nodesById, onSelectNode, pdfCache);
  }

  return renderPdfOrBodyContent({
    activeNodeId,
    bodyProps,
    isActivePdfCachedVisible,
    onCreatePdfHighlight,
    onPersistPdfViewState,
    pdfCache,
    pdfDocumentSurface,
    pdfHighlightLocators
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
