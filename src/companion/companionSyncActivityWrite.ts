import { recordCompanionWorkspaceSyncEvent } from '../shared/platform/companionWorkspaceSync';

export async function writeCompanionSyncActivity(
  event: Parameters<typeof recordCompanionWorkspaceSyncEvent>[0],
  reportUnavailable: (message: string) => void
) {
  try {
    return await recordCompanionWorkspaceSyncEvent(event);
  } catch {
    reportUnavailable('sync_activity_unavailable');
    return null;
  }
}
