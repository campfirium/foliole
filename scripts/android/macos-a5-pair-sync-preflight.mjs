/* global process */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const A5_SERIAL = '87a33a4b';
const APP_ID = 'com.foliole.android';

function evidence(command, args, options = {}, run = spawnSync) {
  const result = run(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (run === spawnSync && result.stdout) process.stdout.write(result.stdout);
  if (run === spawnSync && result.stderr) process.stderr.write(result.stderr);
  return result;
}

function parseEvidence(output, prefix) {
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line) throw new Error(`Missing fixed readiness evidence: ${prefix}`);
  return JSON.parse(line.slice(prefix.length));
}

function isMissingDatabaseBootstrap(pairState, workspaceState) {
  const storedIdentity = /^[0-9a-f]{16}$/u.test(pairState.storedDeviceFingerprint);
  const exactPairFailure = pairState.resultStatus === 'approval_required'
    && pairState.missingPrerequisites?.length === 1
    && pairState.missingPrerequisites[0] === 'database_unavailable'
    && pairState.deviceIdentityFingerprint === null
    && pairState.dirtyRecordCount === null && pairState.nodeCount === null;
  const exactWorkspaceFailure = workspaceState.resultStatus === 'approval_required'
    && workspaceState.missingPrerequisites?.length === 1
    && workspaceState.missingPrerequisites[0] === 'database_missing'
    && Object.values(workspaceState.counts ?? {}).every((value) => value === null)
    && workspaceState.pairingWorkspace?.localDeviceIdentityPresent === false
    && workspaceState.pairingWorkspace?.syncEndpointPresent === false;
  return exactPairFailure && exactWorkspaceFailure && storedIdentity;
}

export function assertMacosA5ProductBootstrap(before, after) {
  if (before.requiresProductBootstrap !== true
      || after.requiresProductBootstrap === true
      || after.deviceIdentityFingerprint !== before.storedDeviceFingerprint) {
    throw new Error('Fixed A5 product bootstrap did not preserve the authorized device identity.');
  }
  return after;
}

export function runMacosA5PairSyncPreflight(paths, run = spawnSync) {
  const common = ['--adb', paths.adb, '--serial', A5_SERIAL, '--app-id', APP_ID];
  const pairing = evidence(process.execPath, [
    path.join(paths.repoRoot, 'scripts/android/android-pair-sync-recovery-readiness-runner.mjs'),
    ...common
  ], { cwd: paths.repoRoot }, run);
  const pairState = parseEvidence(
    pairing.stdout, '[android-data] pair-sync-recovery-readiness='
  );
  const workspace = evidence(process.execPath, [
    path.join(paths.repoRoot, 'scripts/android/android-capture-annotation-readiness-runner.mjs'),
    ...common
  ], { cwd: paths.repoRoot }, run);
  const workspaceState = parseEvidence(
    workspace.stdout, '[android-data] capture-annotation-readiness='
  );
  const authorizedPairing = pairState.pairingCredentialsPresent === true
    && pairState.pairingPeerConflict === false
    && /^[0-9a-f]{16}$/u.test(pairState.remotePeerFingerprint);
  const missingDatabaseBootstrap = authorizedPairing
    && pairState.pairingCredentialsRejected !== true
    && isMissingDatabaseBootstrap(pairState, workspaceState);
  const emptyStalePairing = pairState.nodeCount === 0 && workspaceState.counts?.nodes === 0
    && workspaceState.pairingWorkspace?.syncEndpointPresent === false;
  const syncedProfileSwitch = pairState.nodeCount > 0
    && workspaceState.counts?.nodes === pairState.nodeCount
    && workspaceState.canonicalInbox?.active === true
    && workspaceState.pairingWorkspace?.syncEndpointPresent === true;
  const rejectedWorkspace = pairState.nodeCount > 0
    && workspaceState.counts?.nodes === pairState.nodeCount
    && workspaceState.canonicalInbox?.active === true
    && workspaceState.pairingWorkspace?.localDeviceIdentityPresent === true;
  const rejectedEmptyWorkspace = pairState.nodeCount === 0
    && workspaceState.counts?.nodes === 0
    && workspaceState.counts?.content_blobs === 0
    && workspaceState.counts?.node_order === 0
    && workspaceState.pairingWorkspace?.localDeviceIdentityPresent === true
    && workspaceState.pairingWorkspace?.syncEndpointPresent === true;
  const authorizedWorkspace = workspaceState.pairingWorkspace?.localDeviceIdentityPresent === true
    && (emptyStalePairing || syncedProfileSwitch);
  const existingPairingRecovery = pairState.dirtyRecordCount > 0
    && authorizedPairing && syncedProfileSwitch;
  const cleanPairSwitch = pairing.status === 0 && pairState.dirtyRecordCount === 0
    && authorizedPairing && authorizedWorkspace
    && pairState.pairingCredentialsRejected !== true;
  const rejectedCleanPairing = pairState.dirtyRecordCount === 0
    && pairState.pairingCredentialsRejected === true
    && pairState.pairingCredentialRejectionReason === 'unknown_device'
    && (pairState.remotePeerFingerprint === null
      || /^[0-9a-f]{16}$/u.test(pairState.remotePeerFingerprint))
    && pairState.pairingPeerConflict === false
    && rejectedWorkspace;
  const rejectedEmptyPairing = pairing.status === 0 && pairState.dirtyRecordCount === 0
    && pairState.pairingCredentialsRejected === true
    && pairState.pairingCredentialRejectionReason === null
    && authorizedPairing && rejectedEmptyWorkspace;
  const freshEmptyPairing = pairing.status === 0 && pairState.dirtyRecordCount === 0
    && pairState.nodeCount === 0
    && pairState.pairingCredentialsPresent === false
    && pairState.remotePeerFingerprint === null
    && pairState.pairingPeerConflict === false
    && workspaceState.counts?.nodes === 0
    && workspaceState.counts?.content_blobs === 0
    && workspaceState.counts?.node_order === 0
    && workspaceState.pairingWorkspace?.localDeviceIdentityPresent === true
    && workspaceState.pairingWorkspace?.syncEndpointPresent === false;
  if (!existingPairingRecovery && !cleanPairSwitch && !rejectedCleanPairing
      && !rejectedEmptyPairing && !freshEmptyPairing && !missingDatabaseBootstrap) {
    throw new Error('Fixed A5 no longer matches the authorized pair-switch state.');
  }
  return {
    ...pairState,
    credentialRepairRequired: rejectedCleanPairing || rejectedEmptyPairing || (existingPairingRecovery
      && pairState.pairingCredentialsRejected === true),
    existingPairing: existingPairingRecovery || cleanPairSwitch
      || rejectedEmptyPairing || missingDatabaseBootstrap,
    requiresProductBootstrap: missingDatabaseBootstrap
  };
}
