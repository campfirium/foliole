import { appendReadingPositionTraceLog } from '../shared/platform/bridge';

export function getSnapshotActiveNodeId(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || !('activeNodeId' in snapshot)) {
    return null;
  }
  return (snapshot as { activeNodeId?: string | null }).activeNodeId ?? null;
}

function appendWorkspaceHydrateLog(event: string, payload: Record<string, unknown>) {
  appendReadingPositionTraceLog({
    event,
    payload,
    timestamp: Date.now()
  });
}

export function appendWorkspaceHydrateStartedLog(name: string) {
  appendWorkspaceHydrateLog('workspace.hydrate-started', { storageKey: name });
}

export function appendWorkspaceHydrateCompletedLog(name: string, startedAt: number, snapshot: unknown) {
  appendWorkspaceHydrateLog('workspace.hydrate-completed', {
    activeNodeId: getSnapshotActiveNodeId(snapshot),
    durationMs: Date.now() - startedAt,
    storageKey: name
  });
}

export function appendWorkspaceHydrateFailedLog(name: string, startedAt: number, error: unknown) {
  appendWorkspaceHydrateLog('workspace.hydrate-failed', {
    durationMs: Date.now() - startedAt,
    message: error instanceof Error ? error.message : String(error),
    storageKey: name
  });
}
