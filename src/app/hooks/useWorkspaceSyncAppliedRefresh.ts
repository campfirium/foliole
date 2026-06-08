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
import { reportWorkspaceHydrateBootStage } from '../../store/workspaceHydrateBootTelemetry';
import { useWorkspaceStore } from '../../store/workspaceStore';

let workspaceRefreshInFlight: Promise<void> | null = null;
let workspaceRefreshQueued = false;
let workspaceRefreshDebounceId: ReturnType<typeof globalThis.setTimeout> | null = null;
let workspaceRefreshDebouncedSource: WorkspaceRefreshSource = 'content-changed';

const WORKSPACE_REFRESH_EVENT_DEBOUNCE_MS = 1200;

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
    reportWorkspaceHydrateBootStage('refresh_queued', { source });
    logWorkspaceRehydrateDiagnostic('workspace-rehydrate-queued', { source });
    await workspaceRefreshInFlight;
    return;
  }
  workspaceRefreshQueued = false;
  const startedAt = readEditorInputDiagnosticTime();
  reportWorkspaceHydrateBootStage('refresh_start', { source });
  logWorkspaceRehydrateDiagnostic('workspace-rehydrate-start', { source });
  workspaceRefreshInFlight = Promise.resolve(useWorkspaceStore.persist.rehydrate()).finally(() => {
    workspaceRefreshInFlight = null;
  });
  try {
    await workspaceRefreshInFlight;
  } finally {
    reportWorkspaceHydrateBootStage('refresh_end', {
      queued: workspaceRefreshQueued,
      source,
      totalMs: readEditorInputDiagnosticTime() - startedAt
    });
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

function requestWorkspaceRehydrate(source: WorkspaceRefreshSource) {
  workspaceRefreshDebouncedSource = source;
  if (workspaceRefreshDebounceId) {
    globalThis.clearTimeout(workspaceRefreshDebounceId);
  }
  workspaceRefreshDebounceId = globalThis.setTimeout(() => {
    workspaceRefreshDebounceId = null;
    void scheduleWorkspaceRehydrate(workspaceRefreshDebouncedSource);
  }, WORKSPACE_REFRESH_EVENT_DEBOUNCE_MS);
}

export function useWorkspaceSyncAppliedRefresh() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void onWorkspaceSyncApplied(() => {
      if (!disposed) {
        requestWorkspaceRehydrate('sync-applied');
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
        requestWorkspaceRehydrate('content-changed');
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
