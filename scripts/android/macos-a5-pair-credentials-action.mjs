/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

import {
  DEPARTED_PRESERVED_HISTORY
} from './macos-a5-departed-credential-state.mjs';
import { inspectDesktopDepartureBoundary } from './macos-a5-desktop-departure-inspection.mjs';
import { buildMacosA5Desktop } from './macos-a5-extended-actions.mjs';
import {
  assertFreshCredentialRejoinBaseline, assertJoinedEmptyCredentialReauthorization,
  collectCredentialProtectedReadiness, leaveJoinedEmptyCredentialSession
} from './macos-a5-pair-credentials-rejoin.mjs';
import { runMacosA5PairSync } from './macos-a5-pair-sync-action.mjs';
import { produceCredentialsSignableHandoff } from './macos-a5-credential-handoff.mjs';
import { resolveMacosA5PairSyncReadiness } from './macos-a5-product-bootstrap.mjs';

const CREDENTIAL_EVIDENCE_TIMEOUT_MS = 180_000;
const CREDENTIAL_SCENARIO_TIMEOUT_MS = 120_000;

export const macosA5CredentialsOnlyModeArgs = (rePairRequired = false) => [
  '-e', 'foliolePairSyncEvidenceGoal', 'credentials-signable',
  '-e', 'foliolePairSyncTimeoutMs', String(CREDENTIAL_SCENARIO_TIMEOUT_MS),
  ...(rePairRequired ? ['-e', 'foliolePairSyncMode', 're-pair'] : [])
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

async function prepareFreshCredentialJoin(readiness, context) {
  let pairReadiness = readiness;
  let baseline;
  if (readiness.joinedEmptyReauthorization === true) {
    const protectedReadiness = await context.collect(readiness, context.snapshotArgs);
    baseline = assertJoinedEmptyCredentialReauthorization(protectedReadiness);
    await context.leave({ baseline, ...context.leaveArgs });
    pairReadiness = assertFreshCredentialRejoinBaseline(
      await context.collect(context.resolve(), context.snapshotArgs), baseline
    );
  } else if (readiness.departedCredentialState === DEPARTED_PRESERVED_HISTORY) {
    pairReadiness = await context.collect(readiness, context.snapshotArgs);
    assertFreshCredentialRejoinBaseline(pairReadiness, pairReadiness);
  } else return { pairReadiness };
  const desktop = context.inspectDesktop(pairReadiness);
  pairReadiness.pairTargetAuthorizationFingerprint
    = desktop.remotePeerAuthorizationFingerprint;
  return {
    pairReadiness,
    pairRequestIdentity: pairReadiness.hostName,
    protectedSyncGroup: { groupId: desktop.groupId, timelineId: desktop.timelineId }
  };
}

export async function runMacosA5PairCredentialsEntry(args, dependencies = {}) {
  const resolveReadiness = dependencies.resolveReadiness ?? resolveMacosA5PairSyncReadiness;
  const runPairSync = dependencies.runPairSync ?? runMacosA5PairSync;
  const buildDesktop = dependencies.buildDesktop ?? buildMacosA5Desktop;
  const collectProtectedReadiness = dependencies.collectProtectedReadiness
    ?? collectCredentialProtectedReadiness;
  const leaveJoinedEmpty = dependencies.leaveJoinedEmpty ?? leaveJoinedEmptyCredentialSession;
  const readReceipt = dependencies.readReceipt ?? readCredentialReceipt;
  const produceHandoff = dependencies.produceHandoff ?? produceCredentialsSignableHandoff;
  const inspectDesktopDeparture = dependencies.inspectDesktopDeparture
    ?? ((departed) => inspectDesktopDepartureBoundary(args.paths.desktopDevLibrary, departed));
  args.assertFixed();
  const readiness = resolveReadiness(args.paths);
  args.build();
  buildDesktop(args.checked, args.paths);
  const buildIdentity = args.buildIdentity();
  const evidenceRoot = path.join(
    args.paths.artifactsRoot, 'a5-pair-credentials', buildIdentity
  );
  args.markMutationBoundary?.();
  const { pairReadiness, pairRequestIdentity, protectedSyncGroup }
    = await prepareFreshCredentialJoin(readiness, {
      collect: collectProtectedReadiness, inspectDesktop: inspectDesktopDeparture,
      leave: leaveJoinedEmpty,
      leaveArgs: { buildIdentity, env: args.env, evidenceRoot: path.join(evidenceRoot, 'leave'),
        execute: args.execute, paths: args.paths, serial: args.serial },
      resolve: () => resolveReadiness(args.paths),
      snapshotArgs: { env: args.env, execute: args.execute, paths: args.paths,
        serial: args.serial }
    });
  const result = await runPairSync({
    approvalRequired: true,
    buildIdentity, credentialRepairRequired: true,
    env: args.env, hostName: pairReadiness.hostName,
    evidenceRoot, execute: credentialEvidenceExecute(args.execute),
    existingPairing: pairReadiness.existingPairing,
    instrumentationModeArgs: macosA5CredentialsOnlyModeArgs,
    ...(pairRequestIdentity ? { pairedAuthorizationFingerprint: null, pairRequestIdentity,
      protectedSyncGroup } : {}),
    paths: args.paths, recoveryEvidenceGoal: 'credentials-signable',
    desktopAuthorizationFingerprint: pairReadiness.pairTargetAuthorizationFingerprint,
    serial: args.serial
  });
  assertFreshCredentialReceipt(readReceipt(evidenceRoot));
  produceHandoff({ artifactsRoot: args.paths.artifactsRoot, evidenceRoot,
    currentRevision: args.paths.acceptedRevision ?? undefined,
    readiness: resolveReadiness(args.paths), sourceRepoRoot: args.paths.sourceRepoRoot });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] pair-credentials evidence=${result.pairSyncRecovery.manifestPath}`);
}
