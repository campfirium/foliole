/* global process */

import { cpSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const SERVICE_RELATIVE_PATH = 'scripts/ios/ios-pairing-acceptance-service.js';

export function createPairingAcceptanceServiceCompileArgs(repoRoot, artifactDir) {
  return [
    path.join(repoRoot, 'node_modules/typescript/bin/tsc'),
    path.join(repoRoot, 'scripts/ios/ios-pairing-acceptance-service.ts'),
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

export function createPairingAcceptanceServiceLaunch(repoRoot, artifactDir, scenario = 'pairing-signed-transport') {
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

export function startPairingAcceptanceService(repoRoot, artifactDir, scenario) {
  compilePairingAcceptanceService(repoRoot, artifactDir);
  rmSync(path.join(artifactDir, 'service.json'), { force: true });
  rmSync(path.join(artifactDir, 'service-observations.json'), { force: true });
  const launch = createPairingAcceptanceServiceLaunch(repoRoot, artifactDir, scenario);
  return spawn(launch.command, launch.args, {
    cwd: repoRoot,
    env: launch.env,
    stdio: ['ignore', 'ignore', 'inherit']
  });
}

export function compilePairingAcceptanceService(repoRoot, artifactDir) {
  const outputDirectory = path.join(artifactDir, 'service-dist');
  rmSync(outputDirectory, { force: true, recursive: true });
  const result = spawnSync(process.execPath, createPairingAcceptanceServiceCompileArgs(repoRoot, artifactDir), {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) throw new Error(`Failed to compile iOS pairing acceptance service (${result.status}).`);
  copyAcceptanceContractCorpus(repoRoot, outputDirectory);
}

function copyAcceptanceContractCorpus(repoRoot, outputDirectory) {
  const relativePath = path.join('scripts', 'ios', 'fixtures', 'acceptance-contract-corpus');
  cpSync(path.join(repoRoot, relativePath), path.join(outputDirectory, relativePath), { recursive: true });
}

export function verifyPairingAcceptance(first, second, observations) {
  const firstPassed = first.phase === 'paired' && first.signed_request_passed && first.endpoint_restored;
  const secondPassed = second.phase === 'disconnected' && second.identity_restored &&
    second.pairing_authorization_id === first.pairing_authorization_id
    && second.endpoint_restored &&
    second.signed_after_restart && second.redirect_rejected && second.http_error_propagated &&
    second.pairing_cleared && second.endpoint_cleared && second.signing_rejected_after_disconnect;
  const servicePassed = observations.pair_requested && observations.pair_completed &&
    observations.signature_headers_valid && observations.signed_request_count >= 4 &&
    observations.redirect_target_hits === 0;
  if (!firstPassed || !secondPassed || !servicePassed) {
    throw new Error('iOS pairing acceptance evidence is incomplete.');
  }
  return { first, observations, second };
}
