import fs from 'node:fs';
import path from 'node:path';

import { provisionWindowsAcceptanceRoot } from './windows-multi-device-sync-readiness.mjs';
import { runWindowsMultiDeviceSyncALeave } from './windows-multi-device-sync-a-leave-action.mjs';
import { runWindowsMultiDeviceSyncC } from './windows-multi-device-sync-c-action.mjs';
import { runWindowsMultiDeviceSyncARejoin } from './windows-multi-device-sync-a-rejoin-action.mjs';
import { runWindowsMultiDeviceSyncFromZero } from './windows-multi-device-sync-from-zero-action.mjs';
import {
  runWindowsMultiDeviceSyncParticipation
} from './windows-multi-device-sync-participation-action.mjs';

export async function runWindowsSyncGroupDeviceAction(options) {
  if (options.action === 'desktop-dnssd-route-provider') {
    return (await import('./windows-desktop-dnssd-route-action.mjs'))
      .runWindowsDesktopDnsSdRouteProvider(options);
  }
  if (options.action === 'two-device-sync-provider') {
    return (await import('./windows-two-device-sync-provider-action.mjs'))
      .runWindowsTwoDeviceSyncProvider(options);
  }
  if (options.action === 'single-principal-sync-group') {
    return (await import('./windows-single-principal-sync-group-action.mjs'))
      .runWindowsSinglePrincipalSyncGroup(options);
  }
  if (options.action === 'multi-device-sync-a-leave') {
    return runWindowsMultiDeviceSyncALeave(options);
  }
  if (options.action === 'multi-device-sync-a-rejoin') {
    return runWindowsMultiDeviceSyncARejoin(options);
  }
  if (options.action === 'multi-device-sync-c') {
    return runWindowsMultiDeviceSyncC(options);
  }
  if (options.action === 'multi-device-sync-from-zero') {
    return runWindowsMultiDeviceSyncFromZero(options);
  }
  if (options.action === 'multi-device-sync-participation') {
    return runWindowsMultiDeviceSyncParticipation(options);
  }
  if (options.action === 'multi-device-sync-candidate') {
    if (!options.candidate?.clean) throw new Error('Frozen Windows candidate is missing.');
    const owned = provisionWindowsAcceptanceRoot({ paths: options.paths });
    const manifestPath = path.win32.join(options.evidenceRoot, 'multi-device-sync-candidate.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      buildIdentity: options.buildIdentity, completedAt: new Date().toISOString(),
      candidate: options.candidate, isolatedRoot: owned.root, resultStatus: 'success', schemaVersion: 1
    }, null, 2)}\n`, 'utf8');
    return { multiDeviceSyncCandidate: { manifestPath }, output: '' };
  }
  return null;
}
