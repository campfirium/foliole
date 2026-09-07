import { runWindowsMultiDeviceSyncControl } from './windows-multi-device-sync-control.mjs';
import { runWindowsDefaultSyncJourneyControl } from './windows-default-sync-journey-control.mjs';

export const WINDOWS_SYNC_GROUP_CONTROL_ACTIONS = Object.freeze([
  'default-sync-journey',
  'desktop-dnssd-advertise-acceptance', 'desktop-dnssd-find-acceptance',
  'desktop-dnssd-find-diagnostic', 'desktop-dnssd-route-prepare',
  'desktop-dnssd-route-provider', 'desktop-dnssd-route-selfcheck',
  'multi-device-sync-a-leave', 'multi-device-sync-a-rejoin', 'multi-device-sync-c',
  'multi-device-sync-from-zero', 'multi-device-sync-participation',
  'single-principal-sync-group', 'two-device-sync-provider'
]);

export function isWindowsSyncGroupControlAction(action) {
  return WINDOWS_SYNC_GROUP_CONTROL_ACTIONS.includes(action);
}

export function runWindowsSyncGroupControl(action, options) {
  if (action === 'default-sync-journey') {
    return runWindowsDefaultSyncJourneyControl({ ...options, action });
  }
  if (isWindowsSyncGroupControlAction(action)) {
    return runWindowsMultiDeviceSyncControl({ ...options, action });
  }
  return null;
}
