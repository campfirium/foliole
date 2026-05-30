import { useEffect } from 'react';

import {
  onWorkspaceContentChanged,
  onWorkspaceSyncApplied
} from '../../shared/platform/runtimeShellEvents';
import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic,
  readEditorInputDiagnosticTime
} from '../../store/workspaceEditorInputDiagnostics';
import { useWorkspaceStore } from '../../store/workspaceStore';

let workspaceRefreshInFlight: Promise<void> | null = null;
let workspaceRefreshQueued = false;

type WorkspaceRefreshSource = 'content-changed' | 'queued' | 'sync-applied';

function logWorkspaceRehydrateDiagnostic(
  event: string,
  details: { queued?: boolean; source: WorkspaceRefreshSource; totalMs?: number }
) {
  if (!isEditorInputDiagnosticEnabled()) {
    return;
  }
  logEditorInputDiagnostic(event, details);
}

export async function scheduleWorkspaceRehydrate(source: WorkspaceRefreshSource = 'content-changed') {
  if (workspaceRefreshInFlight) {
    workspaceRefreshQueued = true;
    logWorkspaceRehydrateDiagnostic('workspace-rehydrate-queued', { source });
    await workspaceRefreshInFlight;
    return;
  }
  workspaceRefreshQueued = false;
  const startedAt = readEditorInputDiagnosticTime();
  logWorkspaceRehydrateDiagnostic('workspace-rehydrate-start', { source });
  workspaceRefreshInFlight = Promise.resolve(useWorkspaceStore.persist.rehydrate()).finally(() => {
    workspaceRefreshInFlight = null;
  });
  try {
    await workspaceRefreshInFlight;
  } finally {
    logWorkspaceRehydrateDiagnostic('workspace-rehydrate-end', {
      queued: workspaceRefreshQueued,
      source,
      totalMs: readEditorInputDiagnosticTime() - startedAt
    });
  }
  if (workspaceRefreshQueued) {
    await scheduleWorkspaceRehydrate('queued');
  }
}

export function useWorkspaceSyncAppliedRefresh() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void onWorkspaceSyncApplied(() => {
      if (!disposed) {
        void scheduleWorkspaceRehydrate('sync-applied');
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
        void scheduleWorkspaceRehydrate('content-changed');
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
