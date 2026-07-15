import { useRef, useState } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';

export function useDocumentPanelFolderListSort(containerId: string | null, defaultToManual: boolean) {
  const [preferredKey, setPreferredKey] = useState<FolderListSortKey>(DEFAULT_FOLDER_LIST_SORT_KEY);
  const [preferredDirection, setPreferredDirection] = useState<FolderListSortDirection>(
    DEFAULT_FOLDER_LIST_SORT_DIRECTION
  );
  const visitRef = useRef({ containerId, userSelected: false });
  if (visitRef.current.containerId !== containerId) {
    visitRef.current = { containerId, userSelected: false };
  }
  const usesManualDefault = defaultToManual && !visitRef.current.userSelected;

  return {
    direction: usesManualDefault ? 'asc' as const : preferredDirection,
    key: usesManualDefault ? 'manual' as const : preferredKey,
    setDirection: setPreferredDirection,
    setKey: (key: FolderListSortKey) => {
      visitRef.current.userSelected = true;
      setPreferredKey(key);
    }
  };
}
