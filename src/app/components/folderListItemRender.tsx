import type { NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import type { FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { NodeViewState } from '../../store/workspaceStore';

import { FolderListViewItem, type FolderListItemLayout } from './FolderListViewItem';

export interface RenderFolderListItemArgs {
  activeNodeId?: string | null | undefined;
  isBulkSelectionActive?: boolean;
  itemLayout: FolderListItemLayout;
  node: Node;
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onSelectNodePath?: (nodeId: string) => void;
  sortKey: FolderListSortKey;
}

export function renderFolderListItem(args: RenderFolderListItemArgs) {
  const nodeViewState = args.nodeViewById[args.node.id];
  return (
    <FolderListViewItem
      active={args.activeNodeId === args.node.id}
      {...(args.isBulkSelectionActive === undefined ? {} : { isBulkSelectionActive: args.isBulkSelectionActive })}
      itemLayout={args.itemLayout}
      key={args.node.id}
      node={args.node}
      {...(nodeViewState !== undefined ? { nodeViewState } : {})}
      onSelectNode={args.onSelectNode}
      {...(args.onSelectNodePath ? { onSelectNodePath: args.onSelectNodePath } : {})}
      nodesById={args.nodesById}
      sortKey={args.sortKey}
    />
  );
}
