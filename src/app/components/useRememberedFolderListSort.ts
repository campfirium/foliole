import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import {
  readRememberedFolderListSort,
  rememberFolderListSort,
  useFolderListSortMemorySnapshot
} from '../../shared/platform/desktop/folderListSortMemoryStore';

export type FolderListSortChoice = { direction: FolderListSortDirection; key: FolderListSortKey };

/**
 * The sort a list shows: the person's last choice for this list, else the list's own default. Changes are kept per
 * list, so another folder is never affected; without a list id the default is shown and nothing is kept.
 */
export function useRememberedFolderListSort(listId: string | null | undefined, fallback: FolderListSortChoice) {
  useFolderListSortMemorySnapshot();
  const current = () => readRememberedFolderListSort(listId) ?? fallback;
  const shown = current();

  return {
    direction: shown.direction,
    key: shown.key,
    setDirection: (direction: FolderListSortDirection) => {
      if (listId) rememberFolderListSort(listId, { ...current(), direction }, fallback);
    },
    setKey: (key: FolderListSortKey) => {
      if (listId) rememberFolderListSort(listId, { ...current(), key }, fallback);
    }
  };
}
