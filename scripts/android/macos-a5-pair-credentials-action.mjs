/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

import { runMacosA5PairSync } from './macos-a5-pair-sync-action.mjs';
import {
  assertFreshCredentialRejoinBaseline, assertJoinedEmptyCredentialReauthorization,
  leaveJoinedEmptyCredentialSession
} from './macos-a5-pair-credentials-rejoin.mjs';
import { resolveMacosA5PairSyncReadiness } from './macos-a5-product-bootstrap.mjs';
import { buildMacosA5Desktop } from './macos-a5-extended-actions.mjs';

const CREDENTIAL_EVIDENCE_TIMEOUT_MS = 90_000;

export const macosA5CredentialsOnlyModeArgs = () => [
  '-e', 'foliolePairSyncEvidenceGoal', 'credentials-signable'
];

export function credentialEvidenceExecute(execute, timeoutMs = CREDENTIAL_EVIDENCE_TIMEOUT_MS) {
  return (command, commandArgs, options) => execute(command, commandArgs,
    options?.timeoutCode === 'pair_sync_instrumentation_timeout'
      ? { ...options, timeoutMs: Math.min(options.timeoutMs, timeoutMs) }
      : options);
}

function readCredentialReceipt(evidenceRoot) {
  return JSON.parse(fs.readFileSync(path.join(
    evidenceRoot, 'pair-sync-recovery-receipt.json'
  ), 'utf8'));
}

export function assertFreshCredentialReceipt(receipt) {
  if (receipt.pairingPath !== 'new' || receipt.credentials !== 'saved_signable'
      || receipt.initialSync !== 'not_started') {
    throw new Error('Fresh credential rejoin did not stop before initial sync.');
  }
  return receipt;
}

export async function runMacosA5PairCredentialsEntry(args, dependencies = {}) {
  const resolveReadiness = dependencies.resolveReadiness ?? resolveMacosA5PairSyncReadiness;
  const runPairSync = dependencies.runPairSync ?? runMacosA5PairSync;
  const buildDesktop = dependencies.buildDesktop ?? buildMacosA5Desktop;
  const leaveJoinedEmpty = dependencies.leaveJoinedEmpty ?? leaveJoinedEmptyCredentialSession;
  const readReceipt = dependencies.readReceipt ?? readCredentialReceipt;
  args.assertFixed();
  const readiness = resolveReadiness(args.paths);
  args.build();
  buildDesktop(args.checked, args.paths);
  const buildIdentity = args.buildIdentity();
  const evidenceRoot = path.join(
    args.paths.repoRoot, '.tmp/artifacts/a5-pair-credentials', buildIdentity
  );
  let pairReadiness = readiness;
  let protectedSyncGroup;
  let pairRequestFingerprint;
  if (readiness.joinedEmptyReauthorization === true) {
    const baseline = assertJoinedEmptyCredentialReauthorization(readiness);
    await leaveJoinedEmpty({ baseline, buildIdentity, env: args.env,
      evidenceRoot: path.join(evidenceRoot, 'leave'), execute: args.execute,
      paths: args.paths, serial: args.serial });
    pairReadiness = assertFreshCredentialRejoinBaseline(
      resolveReadiness(args.paths), baseline
    );
    protectedSyncGroup = { groupId: baseline.groupId, timelineId: baseline.timelineId };
    pairRequestFingerprint = baseline.deviceIdentityFingerprint;
    pairReadiness.pairTargetPeerFingerprint = baseline.remotePeerFingerprint;
  }
  const result = await runPairSync({
    buildIdentity, credentialRepairRequired: pairReadiness.credentialRepairRequired,
    deviceFingerprint: pairReadiness.deviceIdentityFingerprint, env: args.env,
    evidenceRoot, execute: credentialEvidenceExecute(args.execute),
    existingPairing: pairReadiness.existingPairing,
    instrumentationModeArgs: macosA5CredentialsOnlyModeArgs,
    ...(pairRequestFingerprint ? { pairedDeviceFingerprint: null, pairRequestFingerprint,
      protectedSyncGroup } : {}),
    paths: args.paths, recoveryEvidenceGoal: 'credentials-signable',
    remotePeerFingerprint: pairReadiness.pairTargetPeerFingerprint, serial: args.serial
  });
  if (pairRequestFingerprint) assertFreshCredentialReceipt(readReceipt(evidenceRoot));
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] pair-credentials evidence=${result.pairSyncRecovery.manifestPath}`);
}
