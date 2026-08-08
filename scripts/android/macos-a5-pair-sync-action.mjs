/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { runWindowsA5PairSyncRecovery } from '../windows/windows-a5-pair-sync-recovery-action.mjs';
import {
  MACOS_DAILY_DEBUG_ROOT
} from '../macos/macos-electron-dev-paths.mjs';
import {
  validateOwnedDesktopPreflight, validateOwnedDesktopRePairPreflight
} from '../windows/windows-pair-sync-desktop-readiness.mjs';
import { openMacosPairSyncDesktopSession } from './macos-pair-sync-desktop-session.mjs';
import { macosPairSyncIdentityFingerprint } from './macos-pair-sync-desktop-session.mjs';

const AUTHORIZED_STALE_DEVICE_FINGERPRINT = 'bd1d679fbb55b53e';

export async function reconcileAuthorizedMacosDailyPairing(
  overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing,
  credentialRepairRequired = false,
  authorizedStaleDeviceFingerprint = AUTHORIZED_STALE_DEVICE_FINGERPRINT
) {
  const safe = session.sanitize(overview);
  const exactStaleShape = existingPairing === false
    && safe.pendingDeviceFingerprints.length === 0
    && safe.pairedDeviceFingerprints.length === 1
    && safe.pairedDeviceFingerprints[0] === authorizedStaleDeviceFingerprint
    && safe.pairedDeviceFingerprints[0] !== deviceFingerprint;
  const exactPeerSwitch = existingPairing === true
    && remotePeerFingerprint
    && safe.desktopPeerFingerprint !== remotePeerFingerprint
    && safe.pairedDeviceFingerprints.length === 1
    && safe.pairedDeviceFingerprints[0] === deviceFingerprint
    && safe.pendingDeviceFingerprints.length === 0;
  const exactCredentialRepair = existingPairing === true && credentialRepairRequired
    && safe.desktopPeerFingerprint === remotePeerFingerprint
    && safe.pairedDeviceFingerprints.length === 1
    && safe.pairedDeviceFingerprints[0] === deviceFingerprint
    && safe.pendingDeviceFingerprints.length === 0;
  const exactClearedDevice = existingPairing === false
    && safe.pairedDeviceFingerprints.length === 1
    && safe.pairedDeviceFingerprints[0] === deviceFingerprint
    && safe.pendingDeviceFingerprints.length === 0;
  const exactMissingCredentialRepair = existingPairing === false
    && credentialRepairRequired
    && safe.pairedDeviceFingerprints.length === 0
    && safe.pendingDeviceFingerprints.length === 0
    && (!remotePeerFingerprint || safe.desktopPeerFingerprint === remotePeerFingerprint);
  if (exactMissingCredentialRepair) {
    const validated = validateOwnedDesktopPreflight(
      overview, session, deviceFingerprint, remotePeerFingerprint, false
    );
    return { ...validated, rePairRequired: true };
  }
  if (exactClearedDevice) {
    const paired = overview.paired_devices.find(
      (device) => macosPairSyncIdentityFingerprint(device.device_id) === deviceFingerprint
    );
    if (!paired) throw new Error('Authorized cleared A5 pairing record is missing.');
    return validateOwnedDesktopPreflight(
      await session.remove(paired.device_id), session, deviceFingerprint, remotePeerFingerprint, false
    );
  }
  if (exactCredentialRepair) {
    const paired = overview.paired_devices.find(
      (device) => macosPairSyncIdentityFingerprint(device.device_id) === deviceFingerprint
    );
    if (!paired) throw new Error('Authorized A5 credential repair record is missing.');
    const reconciled = await session.remove(paired.device_id);
    const validated = validateOwnedDesktopPreflight(
      reconciled, session, deviceFingerprint, remotePeerFingerprint, false
    );
    return { ...validated, rePairRequired: true };
  }
  if (exactPeerSwitch) return validateOwnedDesktopRePairPreflight(
    overview, session, deviceFingerprint, remotePeerFingerprint
  );
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
  return {
    code: 0,
    output: '[macos-a5-dev] one-shot desktop closed; registered DEV restart required\n'
  };
}

export async function runMacosA5PairSync({
  buildIdentity, credentialRepairRequired, deviceFingerprint, existingPairing, env, evidenceRoot, execute, paths, protectData,
  remotePeerFingerprint, runPairSyncRecovery = runWindowsA5PairSyncRecovery, serial
}) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const userDataPath = path.join(paths.repoRoot, MACOS_DAILY_DEBUG_ROOT, 'user-data');
  return runPairSyncRecovery({
    adbPort: '5037', buildIdentity, deviceFingerprint, env, evidenceRoot, execute,
    existingPairing,
    openDesktopSession: (options) => openMacosPairSyncDesktopSession({
      ...options, userDataPath
    }),
    desktopControl: macosDesktopControl,
    validateDesktop: reconcileAuthorizedMacosDailyPairing,
    paths: {
      adbPath: paths.adb,
      repoRoot: paths.repoRoot,
      systemNode: process.execPath
    },
    protectData,
    credentialRepairRequired,
    remotePeerFingerprint,
    serial
  });
}
