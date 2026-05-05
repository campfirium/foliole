import { useState } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  resolveDefaultFolderListSortDirection,
  type FolderListSortKey
} from '../features/nodes/model/folderListOrdering';

export function useCompanionBrowseSortState() {
  const [browseSortKey, setBrowseSortKey] = useState(DEFAULT_FOLDER_LIST_SORT_KEY);
  const [browseSortDirection, setBrowseSortDirection] = useState(DEFAULT_FOLDER_LIST_SORT_DIRECTION);
  const updateBrowseSortKey = (sortKey: FolderListSortKey) => {
    setBrowseSortKey(sortKey);
    setBrowseSortDirection(resolveDefaultFolderListSortDirection());
  };

  return {
    browseSortDirection,
    browseSortKey,
    setBrowseSortDirection,
    setBrowseSortKey: updateBrowseSortKey
  };
}
