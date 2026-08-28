import { runWindowsMultiDeviceSyncControl } from './windows-multi-device-sync-control.mjs';

export function runWindowsSyncGroupControl(action, options) {
  if (['multi-device-sync-a-leave', 'multi-device-sync-a-rejoin', 'multi-device-sync-c',
    'multi-device-sync-from-zero', 'multi-device-sync-participation',
    'single-principal-sync-group', 'two-device-sync-provider'].includes(action)) {
    return runWindowsMultiDeviceSyncControl({ ...options, action });
  }
  return null;
}
