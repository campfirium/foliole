import fs from 'node:fs';
import path from 'node:path';

import { provisionWindowsAcceptanceRoot } from './windows-multi-device-sync-readiness.mjs';
import { runWindowsMultiDeviceSyncALeave } from './windows-multi-device-sync-a-leave-action.mjs';
import { runWindowsMultiDeviceSyncC } from './windows-multi-device-sync-c-action.mjs';
import { runWindowsMultiDeviceSyncARejoin } from './windows-multi-device-sync-a-rejoin-action.mjs';

export async function runWindowsSyncGroupDeviceAction(options) {
  if (options.action === 'multi-device-sync-a-leave') {
    return runWindowsMultiDeviceSyncALeave(options);
  }
  if (options.action === 'multi-device-sync-a-rejoin') {
    return runWindowsMultiDeviceSyncARejoin(options);
  }
  if (options.action === 'multi-device-sync-c') {
    return runWindowsMultiDeviceSyncC(options);
  }
  if (options.action === 'multi-device-sync-candidate') {
    const owned = provisionWindowsAcceptanceRoot({ paths: options.paths });
    const manifestPath = path.win32.join(options.evidenceRoot, 'multi-device-sync-candidate.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      buildIdentity: options.buildIdentity, completedAt: new Date().toISOString(),
      isolatedRoot: owned.root, resultStatus: 'success', schemaVersion: 1
    }, null, 2)}\n`, 'utf8');
    return { multiDeviceSyncCandidate: { manifestPath }, output: '' };
  }
  return null;
}
