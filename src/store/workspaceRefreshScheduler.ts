import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic,
  readEditorInputDiagnosticTime
} from './workspaceEditorInputDiagnostics';
import { reportWorkspaceHydrateBootStage } from './workspaceHydrateBootTelemetry';
import { useWorkspaceStore } from './workspaceStore';

export type WorkspaceRefreshSource =
  | 'backup-restore'
  | 'content-changed'
  | 'external-document-import'
  | 'formal-import'
  | 'global-capture-navigation'
  | 'guided-sample'
  | 'import-overview-reset'
  | 'managed-inbox'
  | 'merge-highlights'
  | 'queued'
  | 'readwise-auto-import'
  | 'readwise-book-load'
  | 'reimport-selected-topic'
  | 'search-palette-import'
  | 'sync-applied';

let workspaceRefreshInFlight: Promise<void> | null = null;
let workspaceRefreshQueued = false;
let workspaceRefreshDebounceId: ReturnType<typeof globalThis.setTimeout> | null = null;
let workspaceRefreshDebouncedSource: WorkspaceRefreshSource = 'content-changed';

const WORKSPACE_REFRESH_EVENT_DEBOUNCE_MS = 1200;

function logWorkspaceRehydrateDiagnostic(
  event: string,
  details: { queued?: boolean; source: WorkspaceRefreshSource; totalMs?: number }
) {
  if (!isEditorInputDiagnosticEnabled()) {
    return;
  }
  logEditorInputDiagnostic(event, details);
}

export async function refreshWorkspaceState(source: WorkspaceRefreshSource = 'content-changed') {
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
    const totalMs = readEditorInputDiagnosticTime() - startedAt;
    reportWorkspaceHydrateBootStage('refresh_end', {
      queued: workspaceRefreshQueued,
      source,
      totalMs
    });
    logWorkspaceRehydrateDiagnostic('workspace-rehydrate-end', {
      queued: workspaceRefreshQueued,
      source,
      totalMs
    });
  }
  if (workspaceRefreshQueued) {
    await refreshWorkspaceState('queued');
  }
}

export function requestWorkspaceStateRefresh(source: WorkspaceRefreshSource) {
  workspaceRefreshDebouncedSource = source;
  if (workspaceRefreshDebounceId) {
    globalThis.clearTimeout(workspaceRefreshDebounceId);
  }
  workspaceRefreshDebounceId = globalThis.setTimeout(() => {
    workspaceRefreshDebounceId = null;
    void refreshWorkspaceState(workspaceRefreshDebouncedSource);
  }, WORKSPACE_REFRESH_EVENT_DEBOUNCE_MS);
}
