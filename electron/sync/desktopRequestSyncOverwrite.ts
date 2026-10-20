import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { loadSyncGroupOverwriteProgress, prepareSyncGroupOverwrite,
  type SyncGroupOverwriteProgress } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { clearReadwiseDeviceConnection } from '../database/readwiseDeviceConnection.js';

import { preserveDesktopIdentityRestore } from './preserveDesktopGroupRestore.js';
import { notifyWorkspaceSyncApplied } from './workspaceSyncAppliedEvents.js';

export async function prepareDesktopRequestSyncOverwrite(host: RequestSyncDatabaseHost,
  progress: SyncGroupOverwriteProgress, restoreId?: string) {
  const current = await host.readSnapshot(loadSyncGroupOverwriteProgress);
  if (restoreId && (current?.groupId !== progress.groupId || current.overwriteId !== progress.overwriteId)) {
    await preserveDesktopIdentityRestore(progress.groupId, restoreId);
  }
  const reset = await host.write(async db => {
    const result = await prepareSyncGroupOverwrite(db, progress);
    clearReadwiseDeviceConnection();
    return result;
  });
  if (reset.cleared) notifyWorkspaceSyncApplied({ workspaceScope: { kind: 'full' }, libraryScope: currentLibraryScope(), appliedNodeIds: reset.removedNodeIds,
    appliedObjectIds: [], appliedReviewOpIds: [] });
}
