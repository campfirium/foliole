import { useEffect, type Dispatch, type SetStateAction } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { refreshCompanionWorkspaceAfterSync } from '../shared/platform/companion/companionWorkspaceRepository';
import { hydrateCompanionFolderListSortMemory } from '../shared/platform/companion/settings/companionFolderListSortMemoryStore';
import { subscribeCompanionSyncApplied } from '../shared/platform/companion/sync/companionSyncApplied';
import { loadCompanionSyncNodeConflicts } from '../shared/platform/companionSyncObjects';

export function useCompanionSyncAppliedRefresh(
  setState: Dispatch<SetStateAction<NativeCompanionWorkspaceSyncState>>,
  setConflictCount: (count: number) => void,
  setError: (error: string | null) => void
) {
  useEffect(() => {
    let active = true;
    const reportError = (error: unknown) => {
      if (active) setError(error instanceof Error ? error.message : String(error));
    };
    const unsubscribe = subscribeCompanionSyncApplied(({ folderListSortChanged }) => {
      if (folderListSortChanged) void hydrateCompanionFolderListSortMemory().catch(reportError);
      void Promise.all([refreshCompanionWorkspaceAfterSync(), loadCompanionSyncNodeConflicts()])
        .then(([snapshot, conflicts]) => {
          if (!active) return;
          setState(current => ({ ...current, workspace_snapshot: snapshot }));
          setConflictCount(conflicts.length);
        }).catch(reportError);
    });
    return () => { active = false; unsubscribe(); };
  }, [setConflictCount, setError, setState]);
}
