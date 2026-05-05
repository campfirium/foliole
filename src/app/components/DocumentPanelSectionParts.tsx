import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';

import { VirtualNodeDetailView } from '../../features/nodes/components/VirtualNodeDetailView';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode } from '../../features/nodes/model/specialNodes';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { resolvePdfDocumentSurface, renderPdfDocumentSurface } from './documentPanelPdfView';
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

function isLikelyPdfSourceReference(content: string) {
  const normalized = content.trim();
  if (!normalized || !/[.][Pp][Dd][Ff](?:$|[?#\s)\]])/.test(normalized)) {
    return false;
  }
  const lineCount = normalized.split('\n').length;
  return lineCount <= 3 || /(?:file:\/\/|[A-Za-z]:[\\/]|\/)/.test(normalized);
}

function renderPdfLoadingSurface() {
  return (
    <section aria-label="PDF reader panel" className="flex min-h-0 flex-1 flex-col bg-bg-canvas" data-testid="pdf-document-loading-shell">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-bg-canvas">
          <div aria-hidden="true" className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-foreground/65" />
        </div>
      </div>
    </section>
  );
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
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  pdfCache: JSX.Element;
  pdfDocumentSurface: ReturnType<typeof resolvePdfDocumentSurface>;
  pdfHighlightLocators: PdfHighlightLocator[];
  shouldHideEditorBodyDuringSourceLoad: boolean;
}) {
  if (!args.pdfDocumentSurface) {
    return (
      <>
        {args.pdfCache}
        {args.shouldHideEditorBodyDuringSourceLoad ? renderPdfLoadingSurface() : renderDocumentBody(args.activeNodeId, args.bodyProps)}
      </>
    );
  }

  if (args.pdfDocumentSurface.state === 'ready') {
    return <>{args.pdfCache}</>;
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
  trashedNodeIds,
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
  const pdfDocumentSurface = resolvePdfDocumentSurface(activeNodeId, sourceDetails.isLoading, sourceDetails.value);
  const pdfHighlightLocators = activeNodeId ? collectPdfHighlightLocators(activeNodeId, nodeOrder, nodesById, trashedNodeIds) : [];
  const shouldHideEditorBodyDuringSourceLoad =
    shouldLoadSourceDetails && !pdfDocumentSurface && sourceDetails.isLoading && sourceDetails.value === null && isLikelyPdfSourceReference(bodyProps.editorContent);
  const shouldRenderEditorBody = !activeNode || (!isVirtualNode(activeNode) && !isFolderListView && !pdfDocumentSurface);

  useEffect(() => {
    if (!shouldRenderEditorBody) {
      bodyProps.onEditorReady?.(null);
    }
  }, [bodyProps, shouldRenderEditorBody]);

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
