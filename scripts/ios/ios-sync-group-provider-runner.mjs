/* global process */

import { cpSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const SERVICE_RELATIVE_PATH = 'scripts/ios/ios-sync-group-provider-fixture.js';

export function createSyncGroupProviderCompileArgs(repoRoot, artifactDir) {
  return [
    path.join(repoRoot, 'node_modules/typescript/bin/tsc'),
    path.join(repoRoot, 'scripts/ios/ios-sync-group-provider-fixture.ts'),
    '--outDir', path.join(artifactDir, 'service-dist'),
    '--rootDir', repoRoot,
    '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext',
    '--target', 'ES2022',
    '--lib', 'ES2022,DOM',
    '--resolveJsonModule',
    '--rewriteRelativeImportExtensions',
    '--noCheck'
  ];
}

export function createSyncGroupProviderLaunch(repoRoot, artifactDir, scenario = 'sync-group-signed-transport') {
  return {
    args: [
      path.join(artifactDir, 'service-dist', SERVICE_RELATIVE_PATH),
      artifactDir,
      scenario
    ],
    command: process.execPath,
    env: process.env
  };
}

export function startSyncGroupProvider(repoRoot, artifactDir, scenario) {
  compileSyncGroupProvider(repoRoot, artifactDir);
  rmSync(path.join(artifactDir, 'service.json'), { force: true });
  rmSync(path.join(artifactDir, 'service-observations.json'), { force: true });
  const launch = createSyncGroupProviderLaunch(repoRoot, artifactDir, scenario);
  return spawn(launch.command, launch.args, {
    cwd: repoRoot,
    env: launch.env,
    stdio: ['ignore', 'ignore', 'inherit']
  });
}

export function compileSyncGroupProvider(repoRoot, artifactDir) {
  const outputDirectory = path.join(artifactDir, 'service-dist');
  rmSync(outputDirectory, { force: true, recursive: true });
  const result = spawnSync(process.execPath, createSyncGroupProviderCompileArgs(repoRoot, artifactDir), {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) throw new Error(`Failed to compile iOS Sync Group provider (${result.status}).`);
  copyAcceptanceContractCorpus(repoRoot, outputDirectory);
}

function copyAcceptanceContractCorpus(repoRoot, outputDirectory) {
  const relativePath = path.join('scripts', 'ios', 'fixtures', 'acceptance-contract-corpus');
  cpSync(path.join(repoRoot, relativePath), path.join(outputDirectory, relativePath), { recursive: true });
}

export function verifySyncGroupTransportAcceptance(first, second, observations) {
  const firstPassed = first.phase === 'join-observed' && first.signed_request_passed &&
    first.endpoint_restored && first.discovery_exact && first.group_persisted;
  const secondPassed = second.phase === 'disconnected' && second.identity_restored &&
    second.group_restored && second.endpoint_restored && second.signed_after_restart &&
    second.redirect_rejected && second.http_error_propagated && second.sync_group_left &&
    second.endpoint_cleared && second.signing_rejected_after_leave;
  const servicePassed = observations.group_key_absent_before_accept && observations.acceptance_explicit &&
    observations.acceptance_collected_count === 1 && observations.acceptance_request_id &&
    observations.accepted_device_id === first.device_identity_key &&
    JSON.stringify(observations.request_statuses) === JSON.stringify(['requested', 'accepted', 'collected']) &&
    observations.signature_headers_valid && observations.signed_request_count >= 4 &&
    observations.redirect_target_hits === 0;
  if (!firstPassed || !secondPassed || !servicePassed) {
    throw new Error('iOS Sync Group transport acceptance evidence is incomplete.');
  }
  return { first, observations, second };
}
