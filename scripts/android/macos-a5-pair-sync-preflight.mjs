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
  const emptyStalePairing = pairState.nodeCount === 0 && workspaceState.counts?.nodes === 0
    && workspaceState.pairingWorkspace?.syncEndpointPresent === false;
  const syncedProfileSwitch = pairState.nodeCount > 0
    && workspaceState.counts?.nodes === pairState.nodeCount
    && workspaceState.canonicalInbox?.active === true
    && workspaceState.pairingWorkspace?.syncEndpointPresent === true;
  const authorizedWorkspace = workspaceState.pairingWorkspace?.localDeviceIdentityPresent === true
    && (emptyStalePairing || syncedProfileSwitch);
  const existingPairingRecovery = pairState.dirtyRecordCount > 0
    && authorizedPairing && syncedProfileSwitch;
  const cleanPairSwitch = pairing.status === 0 && pairState.dirtyRecordCount === 0
    && authorizedPairing && authorizedWorkspace;
  if (!existingPairingRecovery && !cleanPairSwitch) {
    throw new Error('Fixed A5 no longer matches the authorized pair-switch state.');
  }
  return { ...pairState, existingPairing: existingPairingRecovery };
}
