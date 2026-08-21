/* global process */

import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

import { runWindowsA5PairSyncRecovery } from '../windows/windows-a5-pair-sync-recovery-action.mjs';
import {
  validateOwnedDesktopPreflight, validateOwnedDesktopRePairPreflight
} from '../windows/windows-pair-sync-desktop-readiness.mjs';
import { assertPairSyncRuntimeOwnership } from '../windows/windows-a5-pair-sync-recovery-transport.mjs';
import { openMacosPairSyncDesktopSession } from './macos-pair-sync-desktop-session.mjs';
import { macosPairSyncIdentityFingerprint } from './macos-pair-sync-desktop-session.mjs';

const AUTHORIZED_STALE_DEVICE_FINGERPRINT = 'bd1d679fbb55b53e';

function assertHostRoster(overview) {
  const members = overview.sync_group?.members;
  if (!Array.isArray(members)) return false;
  const active = members.filter((member) => member.state === 'active');
  if (active.length === 0) {
    throw new Error('Current Sync Group Host roster requires user review.');
  }
  const hosts = active.map((member) => member.host_name);
  const authorizations = active.map((member) => member.authorization_id);
  if (hosts.some((value) => typeof value !== 'string' || !value.trim())
      || authorizations.some((value) => typeof value !== 'string' || !value.trim())
      || new Set(hosts).size !== hosts.length
      || new Set(authorizations).size !== authorizations.length) {
    throw new Error('Current Sync Group Host roster requires user review.');
  }
  return true;
}

async function reconcileHostRosterPairing(
  overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing,
  credentialRepairRequired
) {
  assertPairSyncRuntimeOwnership(overview, session);
  const safe = session.sanitize(overview);
  const wrongRemotePeer = remotePeerFingerprint
    && safe.desktopPeerFingerprint !== remotePeerFingerprint;
  if (!safe.desktopPeerFingerprint || wrongRemotePeer || safe.pendingDeviceFingerprints.length > 0) {
    throw new Error('Current Sync Group pairing state requires user review.');
  }
  const targetRoute = overview.paired_devices.find(
    (device) => macosPairSyncIdentityFingerprint(device.device_id) === deviceFingerprint
  );
  if (safe.pairedDeviceFingerprints.length === 0) {
    return { ...safe, rePairRequired: true };
  }
  if (!targetRoute && existingPairing) {
    throw new Error('Current Sync Group pairing state requires user review.');
  }
  if (!targetRoute) return { ...safe, rePairRequired: true };
  if (existingPairing && !credentialRepairRequired) return { ...safe, rePairRequired: false };
  const reconciled = await session.remove(targetRoute.device_id);
  return { ...session.sanitize(reconciled), rePairRequired: true };
}

async function reconcileCurrentSyncGroupPairings(
  overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing,
  credentialRepairRequired, protectedSyncGroup
) {
  if (protectedSyncGroup
      && (overview.sync_group?.group_id !== protectedSyncGroup.groupId
        || overview.sync_group?.timeline_id !== protectedSyncGroup.timelineId)) {
    throw new Error('Current Sync Group identity requires user review.');
  }
  if (assertHostRoster(overview)) return reconcileHostRosterPairing(
    overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing,
    credentialRepairRequired
  );
  return null;
}

export async function reconcileAuthorizedMacosDailyPairing(
  overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing,
  credentialRepairRequired = false,
  authorizedStaleDeviceFingerprint = AUTHORIZED_STALE_DEVICE_FINGERPRINT,
  protectedSyncGroup = null
) {
  const currentGroup = await reconcileCurrentSyncGroupPairings(
    overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing,
    credentialRepairRequired, protectedSyncGroup
  );
  if (currentGroup) return currentGroup;
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
      '-TERM', '-f', '^/Applications/Foliole[.]app/Contents/MacOS/Foliole( |$)'
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
  buildIdentity, credentialRepairRequired, desktopControl = macosDesktopControl,
  deviceFingerprint, existingPairing, env, evidenceRoot, execute,
  libraryHome, paths, protectData, remotePeerFingerprint, openTransport, closeTransport,
  instrumentationModeArgs, pairedDeviceFingerprint, pairRequestFingerprint,
  protectedSyncGroup, recoveryEvidenceGoal,
  runPairSyncRecovery = runWindowsA5PairSyncRecovery, serial,
  validateDesktop
}) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const validateMacosDesktop = validateDesktop ?? ((...args) =>
    reconcileAuthorizedMacosDailyPairing(
      ...args, AUTHORIZED_STALE_DEVICE_FINGERPRINT, protectedSyncGroup
    ));
  return runPairSyncRecovery({
    adbPort: '5037', buildIdentity, deviceFingerprint, env, evidenceRoot, execute,
    existingPairing,
    ...(closeTransport ? { closeTransport } : {}),
    openDesktopSession: (options) => openMacosPairSyncDesktopSession({
      ...options, libraryHome
    }),
    ...(openTransport ? { openTransport } : {}),
    ...(instrumentationModeArgs ? { instrumentationModeArgs } : {}),
    ...(pairedDeviceFingerprint !== undefined ? { pairedDeviceFingerprint } : {}),
    ...(pairRequestFingerprint ? { pairRequestFingerprint } : {}),
    ...(recoveryEvidenceGoal ? { recoveryEvidenceGoal } : {}),
    desktopControl, validateDesktop: validateMacosDesktop,
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
