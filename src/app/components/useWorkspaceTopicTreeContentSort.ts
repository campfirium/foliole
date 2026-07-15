import { useState } from 'react';

import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

export function useWorkspaceTopicTreeContentSort(activeFolderId: string, defaultToManual: boolean) {
  const preferred = useWorkspaceContentSort();
  const [userSelectionFolderId, setUserSelectionFolderId] = useState<string | null>(null);
  const usesManualDefault = defaultToManual && userSelectionFolderId !== activeFolderId;
  if (!usesManualDefault) return preferred;
  return {
    ...preferred,
    setSortDirection: preferred.setSortDirection,
    setSortKey: (key: Parameters<typeof preferred.setSortKey>[0]) => {
      setUserSelectionFolderId(activeFolderId);
      preferred.setSortKey(key);
    },
    sort: { direction: 'asc' as const, key: 'manual' as const }
  };
}
