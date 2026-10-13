import { useEffect, type Dispatch, type SetStateAction } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { subscribeCompanionSyncApplied } from '../shared/platform/companion/sync/companionSyncApplied';
import { loadCompanionSyncNodeConflicts } from '../shared/platform/companionSyncObjects';

export function useCompanionSyncAppliedRefresh(
  setState: Dispatch<SetStateAction<NativeCompanionWorkspaceSyncState>>,
  setConflictCount: (count: number) => void,
  setError: (error: string | null) => void
) {
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeCompanionSyncApplied(() => {
      void Promise.all([refreshCompanionWorkspaceAfterMutation(), loadCompanionSyncNodeConflicts()])
        .then(([snapshot, conflicts]) => {
          if (!active) return;
          setState(current => ({ ...current, workspace_snapshot: snapshot }));
          setConflictCount(conflicts.length);
        }).catch((error: unknown) => {
          if (active) setError(error instanceof Error ? error.message : String(error));
        });
    });
    return () => { active = false; unsubscribe(); };
  }, [setConflictCount, setError, setState]);
}
