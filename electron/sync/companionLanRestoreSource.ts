import { openDatabaseConnection } from '../database/connection.js';
import { loadDesktopSyncGroupRestoreState } from '../database/syncGroupRestoreState.js';

export function isCompanionRestoreSourceAvailable(
  groupId: string, sourcePeerId: string, restoreId: string
) {
  const restore = loadDesktopSyncGroupRestoreState(openDatabaseConnection().driver, groupId);
  return Boolean(restore?.applied && restore.event.restore_id === restoreId &&
    restore.event.source_device_identity_key === sourcePeerId);
}
