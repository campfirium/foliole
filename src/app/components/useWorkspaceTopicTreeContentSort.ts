import { useRef } from 'react';

import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

export function useWorkspaceTopicTreeContentSort(activeFolderId: string, defaultToManual: boolean) {
  const preferred = useWorkspaceContentSort();
  const visitRef = useRef({ folderId: activeFolderId, userSelected: false });
  if (visitRef.current.folderId !== activeFolderId) {
    visitRef.current = { folderId: activeFolderId, userSelected: false };
  }
  const usesManualDefault = defaultToManual && !visitRef.current.userSelected;
  if (!usesManualDefault) return preferred;
  return {
    ...preferred,
    setSortDirection: preferred.setSortDirection,
    setSortKey: (key: Parameters<typeof preferred.setSortKey>[0]) => {
      visitRef.current.userSelected = true;
      preferred.setSortKey(key);
    },
    sort: { direction: 'asc' as const, key: 'manual' as const }
  };
}
