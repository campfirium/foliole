import fs from 'node:fs';
import path from 'node:path';

import { provisionWindowsAcceptanceRoot } from './windows-multi-device-sync-readiness.mjs';

export async function runWindowsSyncGroupDeviceAction(options) {
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
