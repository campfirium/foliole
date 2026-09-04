#!/usr/bin/env node
/* global console, process */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runIosAcceptanceAttempts } from './ios-acceptance-attempts.mjs';
import {
  createAcceptanceBuildArgs,
  runIosBootstrapAcceptanceAttempt,
  verifyBootstrapSnapshots
} from './ios-bootstrap-acceptance-attempt.mjs';
import { runIosForegroundSyncLifecycleAcceptance } from './ios-foreground-sync-lifecycle-runner.mjs';
import { waitForBootstrapSnapshot } from './ios-simulator-acceptance-runner.mjs';
import { runStandaloneIosAcceptanceScenario } from './ios-standalone-acceptance-runner.mjs';
import { resolveAcceptanceScenario } from './ios-sync-pack-acceptance-runner.mjs';
import { withIosAcceptanceArtifacts } from './ios-local-storage.mjs';
import { assertQualityCommandAllowed } from '../quality/quality-command-contracts.mjs';

export { createAcceptanceBuildArgs, verifyBootstrapSnapshots, waitForBootstrapSnapshot };

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function resolveAcceptanceArtifactDir(repoRoot, scenario) {
  return path.join(repoRoot, '.tmp/artifacts/ios-bridge-acceptance', scenario);
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('iOS bootstrap acceptance requires macOS with Xcode.');
  const scenario = resolveAcceptanceScenario(process.env.FOLIOLE_IOS_ACCEPTANCE_SCENARIO);
  const artifactRoot = resolveAcceptanceArtifactDir(REPO_ROOT, scenario);
  await withIosAcceptanceArtifacts(REPO_ROOT, scenario, async () => {
    if (await runStandaloneIosAcceptanceScenario(scenario, REPO_ROOT, artifactRoot)) return;
    await runIosAcceptanceAttempts({
      artifactRoot,
      runAttempt: ({ artifactDir, attemptNumber }) => scenario === 'foreground-sync-lifecycle'
        ? runIosForegroundSyncLifecycleAcceptance(REPO_ROOT, artifactDir, attemptNumber)
        : runIosBootstrapAcceptanceAttempt(REPO_ROOT, scenario, artifactDir, attemptNumber)
    });
  });
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  assertQualityCommandAllowed('runner:ios-simulator');
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
