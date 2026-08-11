import { runWindowsMultiDeviceSyncControl } from './windows-multi-device-sync-control.mjs';

export function runWindowsSyncGroupControl(action, options) {
  if (action === 'multi-device-sync-c') return runWindowsMultiDeviceSyncControl(options);
  return null;
}
