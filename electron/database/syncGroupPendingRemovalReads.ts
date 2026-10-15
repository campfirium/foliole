import { syncGroupRemovingEntries, syncGroupDisplayDeviceNames } from '../../lib/platform/syncGroupRemovalModel.js';

import { loadDevices, loadRemovals } from './syncGroupMemberStateReads.js';

export function loadDesktopSyncGroupRemovalPresentation(groupId: string) {
  const devices = loadDevices(groupId);
  const removals = loadRemovals(groupId);
  return { device_display_names: syncGroupDisplayDeviceNames(devices, removals),
    removing_devices: syncGroupRemovingEntries(devices, removals) };
}
