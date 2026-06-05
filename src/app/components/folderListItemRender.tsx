import type { FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { NodeViewState } from '../../store/workspaceStore';

import { moveNodeIdBefore } from './folderListManualOrdering';
import { FolderListViewItem, type FolderListItemLayout } from './FolderListViewItem';

export interface RenderFolderListItemArgs {
  activeNodeId?: string | null | undefined;
  canManualDrag: boolean;
  childNodes: Node[];
  draggedNodeId: string | null;
  folderNodeId?: string;
  itemLayout: FolderListItemLayout;
  node: Node;
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  onSelectNodePath?: (nodeId: string) => void;
  setDraggedNodeId: (nodeId: string | null) => void;
  setFolderManualChildOrder?: (folderNodeId: string, childNodeIds: string[]) => void;
  sortKey: FolderListSortKey;
}

export function renderFolderListItem(args: RenderFolderListItemArgs) {
  const nodeViewState = args.nodeViewById[args.node.id];
  return (
    <FolderListViewItem
      active={args.activeNodeId === args.node.id}
      draggable={args.canManualDrag}
      itemLayout={args.itemLayout}
      key={args.node.id}
      node={args.node}
      {...(nodeViewState !== undefined ? { nodeViewState } : {})}
      onSelectNode={args.onSelectNode}
      {...(args.onSelectNodePath ? { onSelectNodePath: args.onSelectNodePath } : {})}
      nodesById={args.nodesById}
      onDragEnd={() => args.setDraggedNodeId(null)}
      onDragStart={() => args.setDraggedNodeId(args.node.id)}
      onDrop={() => {
        if (!args.folderNodeId || !args.draggedNodeId) return;
        const currentOrder = args.childNodes.map((childNode) => childNode.id);
        args.setFolderManualChildOrder?.(
          args.folderNodeId,
          moveNodeIdBefore(currentOrder, args.draggedNodeId, args.node.id)
        );
        args.setDraggedNodeId(null);
      }}
      sortKey={args.sortKey}
    />
  );
}
