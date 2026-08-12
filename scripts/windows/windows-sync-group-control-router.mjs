import { runWindowsMultiDeviceSyncControl } from './windows-multi-device-sync-control.mjs';

export function runWindowsSyncGroupControl(action, options) {
  if (['multi-device-sync-a-leave', 'multi-device-sync-a-rejoin', 'multi-device-sync-c'].includes(action)) {
    return runWindowsMultiDeviceSyncControl({ ...options, action });
  }
  return null;
}
