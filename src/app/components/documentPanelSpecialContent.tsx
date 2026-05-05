import type { ComponentProps } from 'react';

import { ImageClozeCardView } from '../../features/image-cloze/components/ImageClozeCardView';
import { isLegacyImageClozeNode } from '../../features/image-cloze/model/imageCloze';
import { VirtualNodeDetailView } from '../../features/nodes/components/VirtualNodeDetailView';
import type { FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode } from '../../features/nodes/model/specialNodes';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { resolvePdfDocumentSurface, renderPdfDocumentSurface } from './documentPanelPdfView';
import { FolderListView } from './FolderListView';
import type { PdfHighlightLocator } from './pdfHighlightLocators';

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
  folderListSortKey: FolderListSortKey,
  onChangeFolderListSortKey: (sortKey: FolderListSortKey) => void,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  onSelectNode: (nodeId: string) => void,
  pdfCache: JSX.Element
) {
  return (
    <>
      {pdfCache}
      <FolderListView
        folderNodeId={activeNodeId}
        nodeOrder={nodeOrder}
        nodesById={nodesById}
        onChangeSortKey={onChangeFolderListSortKey}
        onSelectNode={onSelectNode}
        sortKey={folderListSortKey}
      />
    </>
  );
}

function renderLegacyImageClozeContent(
  activeNode: Node,
  onAnswerChange: (answer: string) => void,
  pdfCache: JSX.Element,
  showAnswer: boolean
) {
  return (
    <>
      {pdfCache}
      <ImageClozeCardView node={activeNode} onAnswerChange={onAnswerChange} showAnswer={showAnswer} />
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

export function resolveDocumentPanelContentBody(args: {
  activeNode: Node | undefined;
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  folderListSortKey: FolderListSortKey;
  onChangeFolderListSortKey: (sortKey: FolderListSortKey) => void;
  isActivePdfCachedVisible: boolean;
  isFolderListView: boolean;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  onSelectNode: (nodeId: string) => void;
  pdfCache: JSX.Element;
  pdfDocumentSurface: ReturnType<typeof resolvePdfDocumentSurface>;
  pdfHighlightLocators: PdfHighlightLocator[];
  shouldHideEditorBodyDuringSourceLoad: boolean;
}) {
  if (args.activeNode && isVirtualNode(args.activeNode)) {
    return renderVirtualContent(
      args.activeNode,
      args.nodesById,
      args.onNodeContentChange,
      args.onSelectNode,
      args.pdfCache
    );
  }
  if (args.isFolderListView && args.activeNodeId) {
    return renderFolderContent(
      args.activeNodeId,
      args.folderListSortKey,
      args.onChangeFolderListSortKey,
      args.nodeOrder,
      args.nodesById,
      args.onSelectNode,
      args.pdfCache
    );
  }
  if (args.activeNode && isLegacyImageClozeNode(args.activeNode)) {
    return renderLegacyImageClozeContent(
      args.activeNode,
      args.bodyProps.onAnswerChange,
      args.pdfCache,
      args.bodyProps.hasAnswerSection
    );
  }

  return renderPdfOrBodyContent({
    activeNodeId: args.activeNodeId,
    bodyProps: args.bodyProps,
    isActivePdfCachedVisible: args.isActivePdfCachedVisible,
    onCreatePdfHighlight: args.onCreatePdfHighlight,
    onPersistPdfViewState: args.onPersistPdfViewState,
    pdfCache: args.pdfCache,
    pdfDocumentSurface: args.pdfDocumentSurface,
    pdfHighlightLocators: args.pdfHighlightLocators,
    shouldHideEditorBodyDuringSourceLoad: args.shouldHideEditorBodyDuringSourceLoad
  });
}
