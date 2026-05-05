import { useMemo, useState } from 'react';

import { filterNodeTreeRowsByTitle, type NodeTreeRow } from '../model/nodeTree';

export function useNodeListSearchRows(args: {
  activeRows: NodeTreeRow[];
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  noteRowsAll: NodeTreeRow[];
  trashRowsAll: NodeTreeRow[];
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
        return filterNodeTreeRowsByTitle(args.trashRowsAll, searchQuery);
      }
      return filterNodeTreeRowsByTitle(args.noteRowsAll, searchQuery);
    },
    [
      args.activeRows,
      args.isTrashViewOpen,
      args.isVirtualViewOpen,
      args.noteRowsAll,
      args.trashRowsAll,
      searchQuery
    ]
  );

  return { filteredActiveRows, searchQuery, setSearchQuery };
}
