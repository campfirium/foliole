/* global console, process */

import path from 'node:path';

import { runMacosA5PairSync } from './macos-a5-pair-sync-action.mjs';
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

export async function runMacosA5PairCredentialsEntry(args, dependencies = {}) {
  const resolveReadiness = dependencies.resolveReadiness ?? resolveMacosA5PairSyncReadiness;
  const runPairSync = dependencies.runPairSync ?? runMacosA5PairSync;
  const buildDesktop = dependencies.buildDesktop ?? buildMacosA5Desktop;
  args.assertFixed();
  const readiness = resolveReadiness(args.paths);
  args.build();
  buildDesktop(args.checked, args.paths);
  const buildIdentity = args.buildIdentity();
  const result = await runPairSync({
    buildIdentity, credentialRepairRequired: readiness.credentialRepairRequired,
    deviceFingerprint: readiness.deviceIdentityFingerprint, env: args.env,
    evidenceRoot: path.join(args.paths.repoRoot, '.tmp/artifacts/a5-pair-credentials', buildIdentity),
    execute: credentialEvidenceExecute(args.execute), existingPairing: readiness.existingPairing,
    instrumentationModeArgs: macosA5CredentialsOnlyModeArgs,
    paths: args.paths, recoveryEvidenceGoal: 'credentials-signable',
    remotePeerFingerprint: readiness.pairTargetPeerFingerprint, serial: args.serial
  });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] pair-credentials evidence=${result.pairSyncRecovery.manifestPath}`);
}
