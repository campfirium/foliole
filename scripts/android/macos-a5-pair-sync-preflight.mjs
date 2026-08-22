/* global process */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  classifyDepartedCredentialState, DEPARTED_PRESERVED_HISTORY
} from './macos-a5-departed-credential-state.mjs';
import { hasProtectedPendingSyncState } from './macos-a5-pending-sync-state.mjs';

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
  const storedAuthorization = /^[0-9a-f]{16}$/u.test(pairState.storedAuthorizationFingerprint);
  const exactPairFailure = pairState.resultStatus === 'approval_required'
    && pairState.missingPrerequisites?.length === 1
    && pairState.missingPrerequisites[0] === 'database_unavailable'
    && pairState.localMemberAuthorizationFingerprint === null
    && pairState.dirtyRecordCount === null && pairState.nodeCount === null;
  const exactWorkspaceFailure = workspaceState.resultStatus === 'approval_required'
    && workspaceState.missingPrerequisites?.length === 1
    && workspaceState.missingPrerequisites[0] === 'database_missing'
    && Object.values(workspaceState.counts ?? {}).every((value) => value === null)
    && workspaceState.pairingWorkspace?.localDeviceIdentityPresent === false
    && workspaceState.pairingWorkspace?.syncEndpointPresent === false;
  return exactPairFailure && exactWorkspaceFailure && storedAuthorization;
}

export function assertMacosA5ProductBootstrap(before, after) {
  if (before.requiresProductBootstrap !== true
      || after.requiresProductBootstrap === true
      || after.storedAuthorizationFingerprint !== before.storedAuthorizationFingerprint) {
    throw new Error('Fixed A5 product bootstrap did not preserve the pairing authorization.');
  }
  return after;
}

function inspectMacosA5SyncState(paths, run) {
  const common = ['--adb', paths.adb, '--serial', A5_SERIAL, '--app-id', APP_ID];
  const pairing = evidence(process.execPath, [
    path.join(paths.buildRoot, 'scripts/android/android-pair-sync-recovery-readiness-runner.mjs'),
    ...common
  ], { cwd: paths.buildRoot }, run);
  const pairState = parseEvidence(
    pairing.stdout, '[android-data] pair-sync-recovery-readiness='
  );
  const workspace = evidence(process.execPath, [
    path.join(paths.buildRoot, 'scripts/android/android-capture-annotation-readiness-runner.mjs'),
    ...common
  ], { cwd: paths.buildRoot }, run);
  const workspaceState = parseEvidence(
    workspace.stdout, '[android-data] capture-annotation-readiness='
  );
  return { pairState, pairing, workspaceState };
}

export function inspectMacosA5SyncGroupFacts(paths, run = spawnSync) {
  const { pairState, workspaceState } = inspectMacosA5SyncState(paths, run);
  const workspacePresent = workspaceState.counts?.nodes === pairState.nodeCount
    && workspaceState.canonicalInbox?.active === true
    && workspaceState.pairingWorkspace?.localDeviceIdentityPresent === true
    && workspaceState.pairingWorkspace?.syncEndpointPresent === true;
  if (!workspacePresent) {
    throw new Error('Fixed A5 no longer matches the protected Sync Group workspace.');
  }
  return pairState;
}

export function runMacosA5ExistingSyncPreflight(paths, run = spawnSync) {
  const pairState = inspectMacosA5SyncGroupFacts(paths, run);
  const groupAuthority = pairState.syncGroupCredentialsPresent === true
    && pairState.syncGroupPeerConflict === false
    && /^[0-9a-f]{16}$/u.test(pairState.syncGroupRemotePeerFingerprint ?? '')
    && /^[0-9a-f]{16}$/u.test(pairState.localMemberAuthorizationFingerprint ?? '')
    && typeof pairState.syncGroupId === 'string'
    && typeof pairState.syncGroupTimelineId === 'string'
    && pairState.activeSyncGroupMemberCount >= 2;
  if (!groupAuthority) {
    throw new Error('Fixed A5 no longer matches the authorized existing Sync Group state.');
  }
  return pairState;
}

export function runMacosA5PairSyncPreflight(paths, run = spawnSync) {
  const { pairState, pairing, workspaceState } = inspectMacosA5SyncState(paths, run);
  const authorizedPairing = pairState.pairingCredentialsPresent === true
    && pairState.pairingPeerConflict === false
    && /^[0-9a-f]{16}$/u.test(pairState.pairingPeerAuthorizationFingerprint);
  const missingDatabaseBootstrap = authorizedPairing
    && pairState.pairingCredentialsRejected !== true
    && isMissingDatabaseBootstrap(pairState, workspaceState);
  const emptyStalePairing = pairState.nodeCount === 0 && workspaceState.counts?.nodes === 0
    && workspaceState.pairingWorkspace?.syncEndpointPresent === false;
  const syncedProfileSwitch = pairState.nodeCount > 0
    && workspaceState.counts?.nodes === pairState.nodeCount
    && workspaceState.canonicalInbox?.active === true
    && workspaceState.pairingWorkspace?.syncEndpointPresent === true;
  const joinedEmptyWorkspace = pairState.nodeCount === 0
    && pairState.activeSyncGroupMemberCount > 1
    && typeof pairState.syncGroupId === 'string'
    && typeof pairState.syncGroupTimelineId === 'string'
    && workspaceState.counts?.nodes === 0
    && workspaceState.counts?.content_blobs === 0
    && workspaceState.counts?.node_order === 0
    && workspaceState.pairingWorkspace?.syncEndpointPresent === true;
  const rejectedWorkspace = pairState.nodeCount > 0
    && workspaceState.counts?.nodes === pairState.nodeCount
    && workspaceState.canonicalInbox?.active === true
  const rejectedEmptyWorkspace = pairState.nodeCount === 0
    && workspaceState.counts?.nodes === 0
    && workspaceState.counts?.content_blobs === 0
    && workspaceState.counts?.node_order === 0
    && workspaceState.pairingWorkspace?.syncEndpointPresent === true;
  const authorizedWorkspace = emptyStalePairing || joinedEmptyWorkspace || syncedProfileSwitch;
  const authorizedGroupRoute = pairState.syncGroupCredentialsPresent === true
    && pairState.syncGroupRoutePresent === true
    && pairState.syncGroupPeerConflict === false
    && /^[0-9a-f]{16}$/u.test(pairState.syncGroupRemotePeerFingerprint ?? '');
  const joinedEmptyReauthorization = pairing.status === 0 && pairState.dirtyRecordCount === 0
    && pairState.pairingCredentialsPresent === true
    && pairState.pairingPeerAuthorizationFingerprint === pairState.syncGroupRemotePeerFingerprint
    && pairState.storedAuthorizationFingerprint === pairState.localMemberAuthorizationFingerprint
    && pairState.pairingPeerConflict === false
    && joinedEmptyWorkspace && authorizedGroupRoute;
  const existingPairingRecovery = pairState.dirtyRecordCount > 0
    && authorizedPairing && syncedProfileSwitch;
  const protectedGroupPendingSync = syncedProfileSwitch
    && hasProtectedPendingSyncState(pairState);
  const cleanPairSwitch = pairing.status === 0 && pairState.dirtyRecordCount === 0
    && authorizedPairing && authorizedWorkspace
    && pairState.pairingCredentialsRejected !== true;
  const rejectedCleanPairing = pairState.dirtyRecordCount === 0
    && pairState.pairingCredentialsRejected === true
    && ['local_signing_unavailable', 'unknown_authorization'].includes(
      pairState.pairingCredentialRejectionReason
    )
    && (pairState.pairingPeerAuthorizationFingerprint === null
      || /^[0-9a-f]{16}$/u.test(pairState.pairingPeerAuthorizationFingerprint))
    && pairState.pairingPeerConflict === false
    && rejectedWorkspace;
  const rejectedEmptyPairing = pairing.status === 0 && pairState.dirtyRecordCount === 0
    && pairState.pairingCredentialsRejected === true
    && pairState.pairingCredentialRejectionReason === null
    && authorizedPairing && rejectedEmptyWorkspace;
  const freshEmptyPairing = pairing.status === 0 && pairState.dirtyRecordCount === 0
    && pairState.nodeCount === 0
    && pairState.pairingCredentialsPresent === false
    && pairState.pairingPeerAuthorizationFingerprint === null
    && pairState.pairingPeerConflict === false
    && workspaceState.counts?.nodes === 0
    && workspaceState.counts?.content_blobs === 0
    && workspaceState.counts?.node_order === 0
    && workspaceState.pairingWorkspace?.localDeviceIdentityPresent === true
    && workspaceState.pairingWorkspace?.syncEndpointPresent === false;
  const departedCredentialState = pairing.status === 0
    ? classifyDepartedCredentialState(pairState, workspaceState) : null;
  if (!existingPairingRecovery && !protectedGroupPendingSync
      && !cleanPairSwitch && !rejectedCleanPairing
      && !rejectedEmptyPairing && !freshEmptyPairing && !joinedEmptyReauthorization
      && departedCredentialState !== DEPARTED_PRESERVED_HISTORY && !missingDatabaseBootstrap) {
    throw new Error('Fixed A5 no longer matches the authorized pair-switch state.');
  }
  return {
    ...pairState,
    credentialRepairRequired: rejectedCleanPairing || rejectedEmptyPairing || (existingPairingRecovery
      && pairState.pairingCredentialsRejected === true),
    existingPairing: existingPairingRecovery || protectedGroupPendingSync || cleanPairSwitch
      || rejectedEmptyPairing || missingDatabaseBootstrap,
    pairTargetAuthorizationFingerprint: pairState.pairingPeerAuthorizationFingerprint,
    departedCredentialState,
    joinedEmptyReauthorization,
    protectedPendingSync: protectedGroupPendingSync,
    requiresProductBootstrap: missingDatabaseBootstrap
  };
}
