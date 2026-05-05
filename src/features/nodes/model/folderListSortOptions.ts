import type { FolderListSortDirection, FolderListSortKey } from './folderListOrdering';

export const FOLDER_LIST_SORT_OPTIONS: { key: FolderListSortKey; label: string }[] = [
  { key: 'dateLastOpened', label: 'Last opened' },
  { key: 'dateImported', label: 'Date imported' },
  { key: 'dateSaved', label: 'Date modified' }
];

export function getFolderListSortOrderOptions(): { label: string; value: FolderListSortDirection }[] {
  return [
    { label: 'Recent -> Older', value: 'desc' },
    { label: 'Older -> Recent', value: 'asc' }
  ];
}
