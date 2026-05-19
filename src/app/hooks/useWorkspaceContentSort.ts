import { useEffect, useState } from 'react';

import {
  loadWorkspaceContentSortPreference,
  resolveDefaultWorkspaceContentSortDirection,
  saveWorkspaceContentSortPreference,
  type WorkspaceContentSortDirection,
  type WorkspaceContentSortKey,
  type WorkspaceContentSortState
} from '../components/workspaceContentSort';

export function useWorkspaceContentSort() {
  const [sortRefreshVersion, setSortRefreshVersion] = useState(0);
  const [sort, setSort] = useState<WorkspaceContentSortState>(() => loadWorkspaceContentSortPreference());

  useEffect(() => {
    saveWorkspaceContentSortPreference(sort);
  }, [sort]);

  return {
    setSortDirection: (direction: WorkspaceContentSortDirection) =>
      setSort((current) => ({ ...current, direction })),
    setSortKey: (key: WorkspaceContentSortKey) => {
      setSortRefreshVersion((current) => current + 1);
      setSort((current) => ({
        direction: current.key === key ? current.direction : resolveDefaultWorkspaceContentSortDirection(key),
        key
      }));
    },
    sortRefreshVersion,
    sort
  };
}
