import { useEffect } from 'react';

import { hydrateRuntimeSystemEntryDisplayNames } from '../../shared/platform/desktop/systemEntryDisplayNamesRuntimeRepository';
import {
  onWorkspaceContentChanged,
  onWorkspaceSyncApplied
} from '../../shared/platform/runtimeShellEvents';
import { requestWorkspaceStateRefresh } from '../../store/workspaceRefreshScheduler';

type WorkspaceSyncAppliedPayload = Parameters<Parameters<typeof onWorkspaceSyncApplied>[0]>[0];

const NON_WORKSPACE_OBJECT_TYPES = new Set([
  'external_folder',
  'import_source',
  'node_open_state',
  'setting',
  'watched_folder'
]);

export function syncAppliedChangesWorkspace(payload: WorkspaceSyncAppliedPayload) {
  if (payload.appliedNodeIds.length > 0 || payload.appliedReviewOpIds.length > 0) return true;
  return payload.appliedObjectIds.some((identity) => {
    const separator = identity.indexOf(':');
    if (separator < 0) return true;
    const objectType = identity.slice(0, separator);
    // Desktop view state is host scoped; only Android candidates can materialize in this desktop workspace.
    if (objectType === 'view_state') return identity.startsWith('view_state:session_resume:android:');
    return !NON_WORKSPACE_OBJECT_TYPES.has(objectType);
  });
}

export function useWorkspaceSyncAppliedRefresh() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void onWorkspaceSyncApplied((payload) => {
      if (!disposed) {
        if (syncAppliedChangesWorkspace(payload)) requestWorkspaceStateRefresh('sync-applied');
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
