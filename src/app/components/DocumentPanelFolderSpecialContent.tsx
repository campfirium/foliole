import type { ComponentProps } from 'react';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { getStoredAppLocale } from '../../shared/localization/appLanguage';
import { resolveNodeDisplayTitle } from '../../shared/localization/systemEntryNames';

import { DocumentPanelFolderContent } from './DocumentPanelFolderContent';
import type { FolderListView } from './FolderListView';

export function renderFolderSpecialContent(args: {
  activeNode: Node | undefined;
  activeNodeId: string;
  folderListSortDirection: FolderListSortDirection;
  folderListSortKey: FolderListSortKey;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onChangeFolderListSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeFolderListSortKey: (sortKey: FolderListSortKey) => void;
  onOpenMoveToNode?: ComponentProps<typeof FolderListView>['onOpenMoveToNode'];
  onSelectNode: (nodeId: string) => void;
  pdfCache: JSX.Element;
  trashedNodeIds: string[];
}) {
  return (
    <DocumentPanelFolderContent
      activeNodeId={args.activeNodeId}
      folderListSortDirection={args.folderListSortDirection}
      folderListSortKey={args.folderListSortKey}
      folderTitle={args.activeNode
        ? resolveNodeDisplayTitle(getStoredAppLocale(), args.activeNode.id, args.activeNode.title)
        : 'Folder'}
      nodeOrder={args.nodeOrder}
      nodesById={args.nodesById}
      onChangeFolderListSortDirection={args.onChangeFolderListSortDirection}
      onChangeFolderListSortKey={args.onChangeFolderListSortKey}
      onOpenMoveToNode={args.onOpenMoveToNode}
      onSelectNode={args.onSelectNode}
      pdfCache={args.pdfCache}
      trashedNodeIds={args.trashedNodeIds}
    />
  );
}
