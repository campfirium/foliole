import {
  resolveDefaultFolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';

import { useRememberedFolderListSort } from './useRememberedFolderListSort';

export function useDocumentPanelFolderListSort(containerId: string | null, defaultKey: FolderListSortKey) {
  return useRememberedFolderListSort(containerId, {
    direction: resolveDefaultFolderListSortDirection(defaultKey),
    key: defaultKey
  }, defaultKey === 'dateDeleted' ? undefined : 'dateDeleted');
}
