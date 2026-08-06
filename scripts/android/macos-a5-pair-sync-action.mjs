/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { runWindowsA5PairSyncRecovery } from '../windows/windows-a5-pair-sync-recovery-action.mjs';
import {
  MACOS_DAILY_DEBUG_ROOT
} from '../macos/macos-electron-dev-paths.mjs';
import { validateOwnedDesktopPreflight } from '../windows/windows-pair-sync-desktop-readiness.mjs';
import { openMacosPairSyncDesktopSession } from './macos-pair-sync-desktop-session.mjs';
import { macosPairSyncIdentityFingerprint } from './macos-pair-sync-desktop-session.mjs';

const AUTHORIZED_STALE_DEVICE_FINGERPRINT = 'bd1d679fbb55b53e';

export async function reconcileAuthorizedMacosDailyPairing(
  overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing,
  authorizedStaleDeviceFingerprint = AUTHORIZED_STALE_DEVICE_FINGERPRINT
) {
  const safe = session.sanitize(overview);
  const exactStaleShape = existingPairing === false
    && safe.pendingDeviceFingerprints.length === 0
    && safe.pairedDeviceFingerprints.length === 1
    && safe.pairedDeviceFingerprints[0] === authorizedStaleDeviceFingerprint
    && safe.pairedDeviceFingerprints[0] !== deviceFingerprint;
  if (!exactStaleShape) {
    return validateOwnedDesktopPreflight(
      overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing
    );
  }
  const stale = overview.paired_devices.find(
    (device) => macosPairSyncIdentityFingerprint(device.device_id)
      === authorizedStaleDeviceFingerprint
  );
  if (!stale) throw new Error('Authorized stale daily DEV pairing record is missing.');
  const reconciled = await session.remove(stale.device_id);
  return validateOwnedDesktopPreflight(
    reconciled, session, deviceFingerprint, remotePeerFingerprint, existingPairing
  );
}

async function macosDesktopControl(execute, _paths, _env, action) {
  if (action === 'stop') {
    const result = await execute('/usr/bin/pkill', [
      '-TERM', '-f', '^/Applications/Foliole.app/Contents/MacOS/Foliole$'
    ], { timeoutCode: 'desktop_stop_timeout', timeoutMs: 30_000 });
    if (![0, 1].includes(result.code)) throw new Error('Installed Foliole did not stop cleanly.');
    await delay(1_500);
    return { ...result, output: result.output || '[macos-a5-dev] installed Foliole stopped\n' };
  }
  const result = await execute('/usr/bin/open', ['-gj', '-a', 'Foliole'], {
    timeoutCode: 'desktop_start_timeout', timeoutMs: 30_000
  });
  if (result.code !== 0) throw new Error('Installed Foliole did not restart cleanly.');
  return { ...result, output: result.output || '[macos-a5-dev] installed Foliole restored\n' };
}

export async function runMacosA5PairSync({
  buildIdentity, deviceFingerprint, existingPairing, env, evidenceRoot, execute, paths, protectData, serial
}) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const userDataPath = path.join(paths.repoRoot, MACOS_DAILY_DEBUG_ROOT, 'user-data');
  return runWindowsA5PairSyncRecovery({
    adbPort: '5037', buildIdentity, deviceFingerprint, env, evidenceRoot, execute,
    existingPairing,
    openDesktopSession: (options) => openMacosPairSyncDesktopSession({
      ...options, userDataPath
    }),
    desktopControl: macosDesktopControl,
    openTransport: async () => undefined,
    closeTransport: async () => undefined,
    validateDesktop: reconcileAuthorizedMacosDailyPairing,
    paths: {
      adbPath: paths.adb,
      repoRoot: paths.repoRoot,
      systemNode: process.execPath
    },
    protectData,
    remotePeerFingerprint: null,
    serial
  });
}
