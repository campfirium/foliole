import type { ReactNode } from 'react';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { ExternalLinkOpenRequest } from '../../shared/platform/externalLinkOpenRequest';

import { DocumentPanelScaleSurface } from './DocumentPanelScaleSurface';
import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import type { CentralPanelKind } from './documentPanelSectionModel';
import { DocumentPanelContent } from './DocumentPanelSectionParts';
import type { LinkPanelRecord } from './linkPanelState';

export function DocumentPanelContentAssembly(args: {
  bodyProps: Parameters<typeof DocumentPanelContent>[0]['bodyProps'];
  chrome: ReactNode;
  folderListSortDirection: FolderListSortDirection;
  folderListSortKey: FolderListSortKey;
  isFolderListView: boolean;
  panelKind: CentralPanelKind;
  linkPanels: LinkPanelRecord[];
  onChangeFolderListSortDirection: (value: FolderListSortDirection) => void;
  onChangeFolderListSortKey: (value: FolderListSortKey) => void;
  onCloseExternalLink: (panelId: string) => void;
  onLinkPanelStateChange: (
    panelId: string,
    state: Partial<Pick<LinkPanelRecord, 'canGoBack' | 'canGoForward' | 'currentUrl' | 'title'>>
  ) => void;
  onOpenExternalLink: (request: ExternalLinkOpenRequest) => void;
  overlay: ReactNode;
  props: DocumentPanelSectionProps;
}) {
  return (
    <DocumentPanelContent
      activeNodeId={args.props.activeNodeId}
      bodyProps={args.bodyProps}
      folderListSortDirection={args.folderListSortDirection}
      folderListSortKey={args.folderListSortKey}
      isFolderListView={args.isFolderListView}
      isTrashViewOpen={Boolean(args.props.isTrashViewOpen)}
      linkPanels={args.linkPanels}
      nodeOrder={args.props.nodeOrder}
      nodesById={args.props.nodesById}
      onChangeFolderListSortDirection={args.onChangeFolderListSortDirection}
      onChangeFolderListSortKey={args.onChangeFolderListSortKey}
      onCloseExternalLink={args.onCloseExternalLink}
      onCreatePdfHighlight={args.props.onCreatePdfHighlight}
      onLinkPanelStateChange={args.onLinkPanelStateChange}
      onNodeContentChange={args.props.onNodeContentChange}
      onOpenExternalLink={args.onOpenExternalLink}
      {...(args.props.onOpenMoveToNode ? { onOpenMoveToNode: args.props.onOpenMoveToNode } : {})}
      onPersistPdfViewState={args.props.onPersistPdfViewState}
      onSelectNode={args.props.onSelectNode}
      onSelectNodeInVirtualView={args.props.onSelectNodeInVirtualView ?? args.props.onSelectNode}
      onSelectTrashNode={args.props.onSelectTrashNode}
      trashedNodeIds={args.props.trashedNodeIds}
    >
      {({ content, isPdfSurface }) => (
        <DocumentPanelScaleSurface
          chrome={args.chrome}
          isPdfSurface={isPdfSurface}
          overlay={args.overlay}
          panelKind={args.panelKind}
        >
          {content}
        </DocumentPanelScaleSurface>
      )}
    </DocumentPanelContent>
  );
}
