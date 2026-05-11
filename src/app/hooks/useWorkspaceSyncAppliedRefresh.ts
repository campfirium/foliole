import { useEffect } from 'react';

import {
  onWorkspaceContentChanged,
  onWorkspaceSyncApplied
} from '../../shared/platform/runtimeShellEvents';
import { useWorkspaceStore } from '../../store/workspaceStore';

let workspaceRefreshInFlight: Promise<void> | null = null;
let workspaceRefreshQueued = false;

export async function scheduleWorkspaceRehydrate() {
  if (workspaceRefreshInFlight) {
    workspaceRefreshQueued = true;
    await workspaceRefreshInFlight;
    return;
  }
  workspaceRefreshQueued = false;
  workspaceRefreshInFlight = Promise.resolve(useWorkspaceStore.persist.rehydrate()).finally(() => {
    workspaceRefreshInFlight = null;
  });
  await workspaceRefreshInFlight;
  if (workspaceRefreshQueued) {
    await scheduleWorkspaceRehydrate();
  }
}

export function useWorkspaceSyncAppliedRefresh() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void onWorkspaceSyncApplied(() => {
      if (!disposed) {
        void scheduleWorkspaceRehydrate();
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

export function useWorkspaceContentChangedRefresh() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void onWorkspaceContentChanged(() => {
      if (!disposed) {
        void scheduleWorkspaceRehydrate();
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
