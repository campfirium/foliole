import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  resolveDefaultFolderListSortDirection,
  type FolderListSortKey
} from '../features/nodes/model/folderListOrdering';

import { useCompanionNavigationField } from './CompanionNavigationProvider';

export function useCompanionBrowseSortState() {
  const [browseSortKey, setBrowseSortKey] = useCompanionNavigationField('browseSortKey', DEFAULT_FOLDER_LIST_SORT_KEY);
  const [browseSortDirection, setBrowseSortDirection] = useCompanionNavigationField('browseSortDirection', DEFAULT_FOLDER_LIST_SORT_DIRECTION);
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
