import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY
} from '../../features/nodes/model/folderListOrdering';

import { useRememberedFolderListSort } from './useRememberedFolderListSort';

const MANUAL_DEFAULT = { direction: 'asc', key: 'manual' } as const;
const DATE_DEFAULT = { direction: DEFAULT_FOLDER_LIST_SORT_DIRECTION, key: DEFAULT_FOLDER_LIST_SORT_KEY } as const;

/** Folders with a saved custom order open in that order until the person picks another sort for that folder. */
export function useDocumentPanelFolderListSort(containerId: string | null, defaultToManual: boolean) {
  return useRememberedFolderListSort(containerId, defaultToManual ? MANUAL_DEFAULT : DATE_DEFAULT);
}
