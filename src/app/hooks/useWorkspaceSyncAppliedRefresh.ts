import { useEffect } from 'react';

import { hydrateRuntimeSystemEntryDisplayNames } from '../../shared/platform/desktop/systemEntryDisplayNamesRuntimeRepository';
import {
  onWorkspaceContentChanged,
  onWorkspaceSyncApplied
} from '../../shared/platform/runtimeShellEvents';
import { requestWorkspaceStateRefresh } from '../../store/workspaceRefreshScheduler';

export function useWorkspaceSyncAppliedRefresh() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void onWorkspaceSyncApplied(() => {
      if (!disposed) {
        requestWorkspaceStateRefresh('sync-applied');
        void hydrateRuntimeSystemEntryDisplayNames().catch(() => undefined);
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
        requestWorkspaceStateRefresh('content-changed');
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
