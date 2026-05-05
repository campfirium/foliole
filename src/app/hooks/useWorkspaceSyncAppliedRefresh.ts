import { useEffect } from 'react';

import { onWorkspaceSyncApplied } from '../../shared/platform/runtimeShellEvents';
import { useWorkspaceStore } from '../../store/workspaceStore';

let workspaceSyncRefreshInFlight: Promise<void> | null = null;
let workspaceSyncRefreshQueued = false;

async function refreshWorkspaceFromRuntime() {
  if (workspaceSyncRefreshInFlight) {
    workspaceSyncRefreshQueued = true;
    await workspaceSyncRefreshInFlight;
    return;
  }
  workspaceSyncRefreshQueued = false;
  workspaceSyncRefreshInFlight = Promise.resolve(useWorkspaceStore.persist.rehydrate()).finally(() => {
    workspaceSyncRefreshInFlight = null;
  });
  await workspaceSyncRefreshInFlight;
  if (workspaceSyncRefreshQueued) {
    await refreshWorkspaceFromRuntime();
  }
}

export function useWorkspaceSyncAppliedRefresh() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void onWorkspaceSyncApplied(() => {
      if (!disposed) {
        void refreshWorkspaceFromRuntime();
      }
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten?.();
        return;
      }
      unlisten = nextUnlisten;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
