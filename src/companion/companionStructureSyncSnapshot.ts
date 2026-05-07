import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

const WORKSPACE_SNAPSHOT_REFRESH_TIMEOUT_MS = 8_000;

export async function loadCompanionStateAfterStructureSync(
  fallbackSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot']
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), WORKSPACE_SNAPSHOT_REFRESH_TIMEOUT_MS);
  });
  try {
    const refreshedState = await Promise.race([loadCompanionWorkspaceSyncState(), timeout]);
    if (refreshedState) {
      return {
        ...refreshedState,
        workspace_snapshot: refreshedState.workspace_snapshot ?? fallbackSnapshot
      };
    }
  } catch {
    // Keep the caller's current visible structure when the refresh cannot complete.
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
  return null;
}
