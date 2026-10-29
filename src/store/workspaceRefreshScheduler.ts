import { WorkspaceSnapshotRefresh, workspaceRefreshScopeHasChanges, type WorkspaceRefreshScope } from '../../lib/core/database/workspaceSnapshotRefresh';
import { logRuntimeError } from '../shared/platform/runtimeLogging';

import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic,
  readEditorInputDiagnosticTime
} from './workspaceEditorInputDiagnostics';
import { reportWorkspaceHydrateBootStage } from './workspaceHydrateBootTelemetry';
import { useWorkspaceStore } from './workspaceStore';
import { refreshWorkspaceSyncProjection } from './workspaceSyncProjectionRefresh';

export type WorkspaceRefreshSource =
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

let refreshLibraryScope: string | undefined;
const refreshes = new WorkspaceSnapshotRefresh(null);
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

async function rehydrateWorkspace() {
  await useWorkspaceStore.persist.rehydrate();
  const error = useWorkspaceStore.getState().workspaceHydrationError;
  if (error) throw new Error(error);
}

async function refreshRegisteredWorkspaceState(source: WorkspaceRefreshSource) {
  const startedAt = readEditorInputDiagnosticTime();
  reportWorkspaceHydrateBootStage('refresh_start', { source });
  logWorkspaceRehydrateDiagnostic('workspace-rehydrate-start', { source });
  try {
    await refreshes.refresh(async ({ scope }) => {
      const libraryScope = refreshLibraryScope;
      if (scope.kind === 'nodes' && !scope.activeNode && libraryScope && useWorkspaceStore.getState().isHydrated) {
        try { await refreshWorkspaceSyncProjection(scope, libraryScope); }
        catch (error) {
          logRuntimeError('workspace projection refresh failed', {
            area: 'persistence', action: 'refresh_workspace_projection', fallback: 'full_refresh', error
          });
          await rehydrateWorkspace();
        }
      } else await rehydrateWorkspace();
      return null;
    });
  } finally {
    const totalMs = readEditorInputDiagnosticTime() - startedAt;
    reportWorkspaceHydrateBootStage('refresh_end', { source, totalMs });
    logWorkspaceRehydrateDiagnostic('workspace-rehydrate-end', { source, totalMs });
  }
}

export async function refreshWorkspaceState(source: WorkspaceRefreshSource = 'content-changed') {
  refreshes.register({ kind: 'full' });
  await refreshRegisteredWorkspaceState(source);
}

export function requestWorkspaceSyncRefresh(scope: WorkspaceRefreshScope, libraryScope: string,
  source: WorkspaceRefreshSource = 'sync-applied') {
  if (!workspaceRefreshScopeHasChanges(scope)) return;
  if (refreshLibraryScope !== libraryScope) {
    if (refreshLibraryScope !== undefined) refreshes.reset(null);
    refreshLibraryScope = libraryScope;
  }
  refreshes.register(scope);
  scheduleWorkspaceRefresh(source);
}

export function requestWorkspaceStateRefresh(source: WorkspaceRefreshSource) {
  refreshes.register({ kind: 'full' });
  scheduleWorkspaceRefresh(source);
}

function scheduleWorkspaceRefresh(source: WorkspaceRefreshSource) {
  workspaceRefreshDebouncedSource = source;
  if (workspaceRefreshDebounceId) {
    globalThis.clearTimeout(workspaceRefreshDebounceId);
  }
  workspaceRefreshDebounceId = globalThis.setTimeout(() => {
    workspaceRefreshDebounceId = null;
    void refreshRegisteredWorkspaceState(workspaceRefreshDebouncedSource).catch(error => {
      logRuntimeError('workspace refresh failed', { area: 'persistence', action: 'refresh_workspace',
        fallback: 'retain_pending_refresh', error });
    });
  }, WORKSPACE_REFRESH_EVENT_DEBOUNCE_MS);
}
