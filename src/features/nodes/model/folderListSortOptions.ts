import type { FolderListSortDirection, FolderListSortKey } from './folderListOrdering';

export const FOLDER_LIST_SORT_OPTIONS: { key: FolderListSortKey; label: string }[] = [
  { key: 'dateSaved', label: 'Date modified' },
  { key: 'dateLastOpened', label: 'Last opened' },
  { key: 'dateImported', label: 'Date imported' }
];

export function getFolderListSortOrderOptions(sortKey?: FolderListSortKey): { label: string; value: FolderListSortDirection }[] {
  if (sortKey === 'dateLastOpened') {
    return [{ label: 'Recent -> Older', value: 'desc' }];
  }
  return [
    { label: 'Recent -> Older', value: 'desc' },
    { label: 'Older -> Recent', value: 'asc' }
  ];
}
