import { useMemo, useState } from 'react';

import { filterNodeTreeRowsByTitle, type NodeTreeRow } from '../model/nodeTree';
import { filterTrashRootIdsByTitle } from '../model/trashRootModel';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

export function useNodeListSearchRows(args: {
  activeRows: NodeTreeRow[];
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  noteRowsAll: NodeTreeRow[];
  trashRowsAll: NodeTreeRow[];
  trashedNodeIds: string[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredActiveRows = useMemo(
    () => {
      if (args.isVirtualViewOpen) {
        return args.activeRows;
      }
      if (!searchQuery.trim()) {
        return args.activeRows;
      }
      if (args.isTrashViewOpen) {
        const rootIds = filterTrashRootIdsByTitle(
          args.activeRows.map((row) => row.node.id),
          args.nodeOrder,
          args.nodesById,
          args.trashedNodeIds,
          searchQuery
        );
        return args.activeRows.filter((row) => rootIds.includes(row.node.id));
      }
      return filterNodeTreeRowsByTitle(args.noteRowsAll, searchQuery);
    },
    [
      args.activeRows,
      args.isTrashViewOpen,
      args.isVirtualViewOpen,
      args.nodeOrder,
      args.nodesById,
      args.noteRowsAll,
      args.trashRowsAll,
      args.trashedNodeIds,
      searchQuery
    ]
  );

  return { filteredActiveRows, searchQuery, setSearchQuery };
}
