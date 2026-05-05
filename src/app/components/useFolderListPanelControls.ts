import { useState } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  resolveDefaultFolderListSortDirection,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';

export function useFolderListPanelControls() {
  const [folderListSortKey, setFolderListSortKey] = useState<FolderListSortKey>(DEFAULT_FOLDER_LIST_SORT_KEY);
  const [folderListSortDirection, setFolderListSortDirection] = useState<FolderListSortDirection>(
    DEFAULT_FOLDER_LIST_SORT_DIRECTION
  );
  const [folderListSearchQuery, setFolderListSearchQuery] = useState('');

  const handleFolderListSortKeyChange = (nextSortKey: FolderListSortKey) => {
    setFolderListSortKey(nextSortKey);
    setFolderListSortDirection(resolveDefaultFolderListSortDirection(nextSortKey));
  };

  return {
    folderListSearchQuery,
    folderListSortDirection,
    folderListSortKey,
    handleFolderListSortKeyChange,
    setFolderListSearchQuery,
    setFolderListSortDirection
  };
}
