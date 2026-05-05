import { useMemo, useState } from 'react';

import { filterNodeTreeRowsByTitle, type NodeTreeRow } from '../model/nodeTree';

export function useNodeListSearchRows(args: {
  activeRows: NodeTreeRow[];
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  noteRowsAll: NodeTreeRow[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredActiveRows = useMemo(
    () => {
      if (args.isTrashViewOpen || args.isVirtualViewOpen) {
        return args.activeRows;
      }
      if (!searchQuery.trim()) {
        return args.activeRows;
      }
      return filterNodeTreeRowsByTitle(args.noteRowsAll, searchQuery);
    },
    [args.activeRows, args.isTrashViewOpen, args.isVirtualViewOpen, args.noteRowsAll, searchQuery]
  );

  return { filteredActiveRows, searchQuery, setSearchQuery };
}
