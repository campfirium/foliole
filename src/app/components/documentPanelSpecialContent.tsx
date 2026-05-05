import type { ComponentProps, ReactNode, RefObject } from 'react';

import { ImageClozeCardView } from '../../features/image-cloze/components/ImageClozeCardView';
import { isLegacyImageClozeNode } from '../../features/image-cloze/model/imageCloze';
import { VirtualNodeDetailView } from '../../features/nodes/components/VirtualNodeDetailView';
import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode } from '../../features/nodes/model/specialNodes';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { resolvePdfDocumentSurface, renderPdfDocumentSurface } from './documentPanelPdfView';
import { FolderListView } from './FolderListView';
import { LinkPanelStack } from './LinkPanelStack';
import type { LinkPanelRecord } from './linkPanelState';
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
  documentMaxWidth: number,
  activeNodeId: string,
  folderTitle: string,
  folderListSortDirection: FolderListSortDirection,
  folderListSortKey: FolderListSortKey,
  onChangeFolderListSortDirection: (sortDirection: FolderListSortDirection) => void,
  onChangeFolderListSortKey: (sortKey: FolderListSortKey) => void,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  onResetLayout: () => void,
  onSelectNode: (nodeId: string) => void,
  onStartDocumentResize: ComponentProps<typeof DocumentPanelBody>['onStartDocumentResize'],
  pdfCache: JSX.Element
) {
  return (
    <>
      {pdfCache}
      <FolderListView
        documentMaxWidth={documentMaxWidth}
        folderNodeId={activeNodeId}
        folderTitle={folderTitle}
        nodeOrder={nodeOrder}
        nodesById={nodesById}
        onChangeSortDirection={onChangeFolderListSortDirection}
        onChangeSortKey={onChangeFolderListSortKey}
        onResetLayout={onResetLayout}
        onSelectNode={onSelectNode}
        onStartDocumentResize={onStartDocumentResize}
        showEmbeddedHeader={false}
        sortDirection={folderListSortDirection}
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

function renderPdfOrBodyShell(contentAreaRef: RefObject<HTMLDivElement | null>, pdfCache: JSX.Element, content: ReactNode, panelStack: JSX.Element) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" ref={contentAreaRef as ComponentProps<'div'>['ref']}>
      {pdfCache}
      {content}
      {panelStack}
    </div>
  );
}

function renderPdfOrBodyContent(args: {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  contentAreaRef: RefObject<HTMLDivElement | null>;
  isActivePdfCachedVisible: boolean;
  linkPanels: LinkPanelRecord[];
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onCloseExternalLink: (panelId: string) => void;
  onLinkPanelStateChange: (
    panelId: string,
    state: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>
  ) => void;
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  pdfCache: JSX.Element;
  pdfDocumentSurface: ReturnType<typeof resolvePdfDocumentSurface>;
  pdfHighlightLocators: PdfHighlightLocator[];
  shouldHideEditorBodyDuringSourceLoad: boolean;
}) {
  const panelStack = (
    <LinkPanelStack
      anchorRootRef={args.contentAreaRef}
      onClose={args.onCloseExternalLink}
      onStateChange={args.onLinkPanelStateChange}
      panels={args.linkPanels}
    />
  );

  if (!args.pdfDocumentSurface) {
    return renderPdfOrBodyShell(
      args.contentAreaRef,
      args.pdfCache,
      args.shouldHideEditorBodyDuringSourceLoad ? renderPdfLoadingSurface() : renderDocumentBody(args.activeNodeId, args.bodyProps),
      panelStack
    );
  }

  if (args.pdfDocumentSurface.state === 'ready') {
    return renderPdfOrBodyShell(args.contentAreaRef, args.pdfCache, null, panelStack);
  }

  return renderPdfOrBodyShell(
    args.contentAreaRef,
    args.pdfCache,
    !args.isActivePdfCachedVisible
      ? renderPdfDocumentSurface(
          args.pdfDocumentSurface,
          { editorNodeId: args.bodyProps.editorNodeId, editorNodeViewState: args.bodyProps.editorNodeViewState },
          args.pdfHighlightLocators,
          args.onCreatePdfHighlight,
          args.onPersistPdfViewState,
          args.onOpenExternalLink
        )
      : null,
    panelStack
  );
}

export function resolveDocumentPanelContentBody(args: {
  activeNode: Node | undefined;
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  contentAreaRef: RefObject<HTMLDivElement | null>;
  folderListSortDirection: FolderListSortDirection;
  folderListSortKey: FolderListSortKey;
  onChangeFolderListSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeFolderListSortKey: (sortKey: FolderListSortKey) => void;
  isActivePdfCachedVisible: boolean;
  isFolderListView: boolean;
  linkPanels: LinkPanelRecord[];
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onCloseExternalLink: (panelId: string) => void;
  onLinkPanelStateChange: (
    panelId: string,
    state: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>
  ) => void;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  onSelectNode: (nodeId: string) => void;
  pdfCache: JSX.Element;
  pdfDocumentSurface: ReturnType<typeof resolvePdfDocumentSurface>;
  pdfHighlightLocators: PdfHighlightLocator[];
  shouldHideEditorBodyDuringSourceLoad: boolean;
}) {
  const specialContent = resolveSpecialDocumentContent(args);
  if (specialContent) {
    return specialContent;
  }

  return renderPdfOrBodyContent({
    activeNodeId: args.activeNodeId,
    bodyProps: args.bodyProps,
    contentAreaRef: args.contentAreaRef,
    isActivePdfCachedVisible: args.isActivePdfCachedVisible,
    linkPanels: args.linkPanels,
    onCreatePdfHighlight: args.onCreatePdfHighlight,
    onCloseExternalLink: args.onCloseExternalLink,
    onLinkPanelStateChange: args.onLinkPanelStateChange,
    onOpenExternalLink: args.onOpenExternalLink,
    onPersistPdfViewState: args.onPersistPdfViewState,
    pdfCache: args.pdfCache,
    pdfDocumentSurface: args.pdfDocumentSurface,
    pdfHighlightLocators: args.pdfHighlightLocators,
    shouldHideEditorBodyDuringSourceLoad: args.shouldHideEditorBodyDuringSourceLoad
  });
}

function resolveSpecialDocumentContent(args: Parameters<typeof resolveDocumentPanelContentBody>[0]) {
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
      args.bodyProps.documentMaxWidth,
      args.activeNodeId,
      args.activeNode?.title ?? 'Folder',
      args.folderListSortDirection,
      args.folderListSortKey,
      args.onChangeFolderListSortDirection,
      args.onChangeFolderListSortKey,
      args.nodeOrder,
      args.nodesById,
      args.bodyProps.onResetLayout,
      args.onSelectNode,
      args.bodyProps.onStartDocumentResize,
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
  return null;
}
