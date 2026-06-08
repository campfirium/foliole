import { filterNodeTreeRowsByTitle, type NodeTreeRow } from '../model/nodeTree';
import { filterTrashRootIdsByTitle } from '../model/trashRootModel';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

export interface ResolveNodeListActiveRowsArgs {
  activeRows: NodeTreeRow[];
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  noteRowsAll: NodeTreeRow[];
  searchQuery: string;
  trashedNodeIds: string[];
}

export function resolveNodeListActiveRows(args: ResolveNodeListActiveRowsArgs) {
  if (args.isVirtualViewOpen) {
    return args.activeRows;
  }
  if (!args.searchQuery.trim()) {
    return args.activeRows;
  }
  if (args.isTrashViewOpen) {
    const rootIds = filterTrashRootIdsByTitle(
      args.activeRows.map((row) => row.node.id),
      args.nodeOrder,
      args.nodesById,
      args.trashedNodeIds,
      args.searchQuery
    );
    return args.activeRows.filter((row) => rootIds.includes(row.node.id));
  }
  return filterNodeTreeRowsByTitle(args.noteRowsAll, args.searchQuery);
}
