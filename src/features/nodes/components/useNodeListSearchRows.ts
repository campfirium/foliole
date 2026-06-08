import { useMemo, useState } from 'react';

import type { NodeTreeRow } from '../model/nodeTree';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { resolveNodeListActiveRows } from './nodeListActiveRows';

export function useNodeListSearchRows(args: {
  activeRows: NodeTreeRow[];
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  noteRowsAll: NodeTreeRow[];
  trashedNodeIds: string[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredActiveRows = useMemo(
    () =>
      resolveNodeListActiveRows({
        activeRows: args.activeRows,
        isTrashViewOpen: args.isTrashViewOpen,
        isVirtualViewOpen: args.isVirtualViewOpen,
        nodeOrder: args.nodeOrder,
        nodesById: args.nodesById,
        noteRowsAll: args.noteRowsAll,
        searchQuery,
        trashedNodeIds: args.trashedNodeIds
      }),
    [
      args.activeRows,
      args.isTrashViewOpen,
      args.isVirtualViewOpen,
      args.nodeOrder,
      args.nodesById,
      args.noteRowsAll,
      args.trashedNodeIds,
      searchQuery
    ]
  );

  return { filteredActiveRows, searchQuery, setSearchQuery };
}
