import { syncGroupRemovingEntries } from '../../lib/platform/syncGroupRemovalModel.js';

import { loadDevices, loadRemovals } from './syncGroupMemberStateReads.js';

export function loadDesktopSyncGroupRemovingEntries(groupId: string) {
  return syncGroupRemovingEntries(loadDevices(groupId), loadRemovals(groupId));
}
