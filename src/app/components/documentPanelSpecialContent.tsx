import type { ComponentProps, RefObject } from 'react';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode, isVirtualRootNode } from '../../features/nodes/model/specialNodes';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';
import type { NodeViewState } from '../../store/workspaceStore';

import { DocumentPanelBody } from './DocumentPanelBody';
import { renderFolderSpecialContent } from './DocumentPanelFolderSpecialContent';
import { resolvePdfDocumentSurface } from './documentPanelPdfView';
import { renderPdfOrBodyContent } from './DocumentPanelRegularContent';
import { DocumentPanelTrashContent } from './DocumentPanelTrashContent';
import type { LinkPanelRecord } from './linkPanelState';
import type { PdfHighlightLocator } from './pdfHighlightLocators';
import { VirtualDocumentSurface } from './VirtualDocumentSurface';

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
  isTrashViewOpen: boolean;
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
  onOpenMoveToNode?: Parameters<typeof renderFolderSpecialContent>[0]['onOpenMoveToNode'];
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  onSelectTrashNode?: ((nodeId: string) => void) | undefined;
  pdfCache: JSX.Element;
  pdfDocumentSurface: ReturnType<typeof resolvePdfDocumentSurface>;
  pdfHighlightLocators: PdfHighlightLocator[];
  shouldHideEditorBodyDuringSourceLoad: boolean;
  t: Translate;
  trashedNodeIds: string[];
}) {
  const specialContent = resolveSpecialDocumentContent(args);
  if (specialContent) {
    return specialContent;
  }

  return renderRegularDocumentContent(args);
}

function renderRegularDocumentContent(args: Parameters<typeof resolveDocumentPanelContentBody>[0]) {
  return renderPdfOrBodyContent({
    activeNodeId: args.activeNodeId,
    bodyProps: args.bodyProps,
    contentAreaRef: args.contentAreaRef,
    isActivePdfCachedVisible: args.isActivePdfCachedVisible,
    isTrashViewOpen: args.isTrashViewOpen,
    linkPanels: args.linkPanels,
    onCreatePdfHighlight: args.onCreatePdfHighlight,
    onCloseExternalLink: args.onCloseExternalLink,
    onLinkPanelStateChange: args.onLinkPanelStateChange,
    onOpenExternalLink: args.onOpenExternalLink,
    onPersistPdfViewState: args.onPersistPdfViewState,
    onSelectNode: args.onSelectNode,
    pdfCache: args.pdfCache,
    pdfDocumentSurface: args.pdfDocumentSurface,
    pdfHighlightLocators: args.pdfHighlightLocators,
    shouldHideEditorBodyDuringSourceLoad: args.shouldHideEditorBodyDuringSourceLoad,
    t: args.t,
    trashedNodeIds: args.trashedNodeIds
  });
}

function resolveSpecialDocumentContent(args: Parameters<typeof resolveDocumentPanelContentBody>[0]) {
  if (args.isTrashViewOpen && (!args.activeNode || args.activeNode.kind === 'folder') && args.onSelectTrashNode) {
    return (
      <DocumentPanelTrashContent
        folderListSortDirection={args.folderListSortDirection}
        folderListSortKey={args.folderListSortKey}
        folderNodeId={args.activeNode?.id ?? null}
        folderTitle={args.activeNode?.title ?? 'Trash'}
        nodeOrder={args.nodeOrder}
        nodesById={args.nodesById}
        onChangeFolderListSortDirection={args.onChangeFolderListSortDirection}
        onChangeFolderListSortKey={args.onChangeFolderListSortKey}
        onSelectTrashNode={args.onSelectTrashNode}
        pdfCache={args.pdfCache}
        trashedNodeIds={args.trashedNodeIds}
      />
    );
  }
  if (args.activeNode && (isVirtualNode(args.activeNode) || isVirtualRootNode(args.activeNode))) {
    return (
      <VirtualDocumentSurface
        activeNode={args.activeNode}
        nodeOrder={args.nodeOrder}
        nodesById={args.nodesById}
        onSelectNode={args.onSelectNodeInVirtualView}
        onSelectNodePath={args.onSelectNode}
        pdfCache={args.pdfCache}
        trashedNodeIds={args.trashedNodeIds}
      />
    );
  }
  if (args.isFolderListView && args.activeNodeId) {
    return renderFolderSpecialContent({ ...args, activeNodeId: args.activeNodeId });
  }
  return null;
}
