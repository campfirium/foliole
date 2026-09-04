import type { ComponentProps } from 'react';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';

import { FolderListView } from './FolderListView';

function normalizeFolderListSort(
  key: FolderListSortKey,
  direction: FolderListSortDirection
): { key: FolderListSortKey; direction: FolderListSortDirection } {
  if (key === 'dateDeleted') {
    return { key: 'dateSaved', direction: 'desc' };
  }
  return { key, direction };
}

export function DocumentPanelFolderContent({
  activeNodeId,
  folderListSortDirection,
  folderListSortKey,
  folderTitle,
  nodeOrder,
  nodesById,
  onChangeFolderListSortDirection,
  onChangeFolderListSortKey,
  onOpenMoveToNode,
  onSelectNode,
  pdfCache,
  trashedNodeIds
}: {
  activeNodeId: string;
  folderListSortDirection: FolderListSortDirection;
  folderListSortKey: FolderListSortKey;
  folderTitle: string;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onChangeFolderListSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeFolderListSortKey: (sortKey: FolderListSortKey) => void;
  onOpenMoveToNode: ComponentProps<typeof FolderListView>['onOpenMoveToNode'];
  onSelectNode: (nodeId: string) => void;
  pdfCache: JSX.Element;
  trashedNodeIds: string[];
}) {
  const normalizedSort = normalizeFolderListSort(folderListSortKey, folderListSortDirection);

  return (
    <>
      {pdfCache}
      <FolderListView
        folderNodeId={activeNodeId}
        folderTitle={folderTitle}
        mouseGesturesEnabled
        nodeOrder={nodeOrder}
        nodesById={nodesById}
        onChangeSortDirection={onChangeFolderListSortDirection}
        onChangeSortKey={onChangeFolderListSortKey}
        {...(onOpenMoveToNode ? { onOpenMoveToNode } : {})}
        onSelectNode={onSelectNode}
        sortDirection={normalizedSort.direction}
        sortKey={normalizedSort.key}
        trashedNodeIds={trashedNodeIds}
      />
    </>
  );
}
