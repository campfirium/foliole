import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import {
  companionSyncTimeoutOwnership,
  createCompanionSyncTimeoutError
} from '../shared/platform/companionSyncTimeoutOwnership';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

const WORKSPACE_SNAPSHOT_REFRESH_TIMEOUT_MS =
  companionSyncTimeoutOwnership('workspace_snapshot_refresh').timeoutMs;

export type CompanionStructureSnapshotFallbackReason = 'db_busy' | 'error' | 'no_data' | 'timeout';

export interface CompanionStructureSnapshotRefreshReport {
  elapsedMs: number;
  fallbackReason: CompanionStructureSnapshotFallbackReason | null;
  state: NativeCompanionWorkspaceSyncState | null;
}

function classifySnapshotRefreshError(error: unknown): CompanionStructureSnapshotFallbackReason {
  const message = error instanceof Error ? error.message : String(error);
  return /database is locked|database locked|sqlite_busy|db busy/i.test(message) ? 'db_busy' : 'error';
}

export async function loadCompanionStateAfterStructureSyncReport(
  fallbackSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot']
): Promise<CompanionStructureSnapshotRefreshReport> {
  const startedAt = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(createCompanionSyncTimeoutError('workspace_snapshot_refresh')),
      WORKSPACE_SNAPSHOT_REFRESH_TIMEOUT_MS
    );
  });
  try {
    const refreshedState = await Promise.race([loadCompanionWorkspaceSyncState(), timeout]);
    return {
      elapsedMs: Date.now() - startedAt,
      fallbackReason: refreshedState.workspace_snapshot ? null : 'no_data',
      state: {
        ...refreshedState,
        workspace_snapshot: refreshedState.workspace_snapshot ?? fallbackSnapshot
      }
    };
  } catch (error) {
    return {
      elapsedMs: Date.now() - startedAt,
      fallbackReason: error instanceof Error && error.message.includes('timed out') ? 'timeout' : classifySnapshotRefreshError(error),
      state: null
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function loadCompanionStateAfterStructureSync(
  fallbackSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot']
) {
  return (await loadCompanionStateAfterStructureSyncReport(fallbackSnapshot)).state;
}
