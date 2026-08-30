#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createFriPhysicalReadinessAdapter } from './fri-physical-readiness.mjs';

export const FRI_COREDEVICE_ID = 'CB302BF0-6B5B-5737-8DA8-21F8081E19E7';
export const FRI_ORDINARY_APP_ID = 'com.foliole.ios.ordinaryjourney';
export const FRI_ORDINARY_BUNDLE_SUFFIX = '.ordinaryjourney';
export const FRI_ORDINARY_TEST =
  'AppPhysicalUITests/FoliolePhysicalOrdinaryJourneyUITests/testCapturesContentAndPersistsAfterRelaunch';
export const FRI_XCUITEST_RUNNER =
  '/Users/roamer/.codex/skills/ios-physical-acceptance/scripts/run-fri-xcuitest.sh';

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function timestamp() {
  return new Date().toISOString().replaceAll(/[-:.TZ]/gu, '');
}

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${options.stage ?? command} failed with exit code ${result.status}.`);
  }
}

export function buildFriOrdinaryJourneyCommands({ evidenceRoot, repoRoot }) {
  return [
    { command: 'npm', args: ['run', 'android:web:build'], stage: 'companion-build' },
    { command: 'npx', args: ['cap', 'sync', 'ios'], stage: 'capacitor-ios-sync' },
    {
      command: 'bash',
      args: [FRI_XCUITEST_RUNNER,
        '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'),
        '--scheme', 'AppPhysicalUITests',
        '--artifacts-dir', path.join(evidenceRoot, 'xcuitest'),
        '--only-testing', FRI_ORDINARY_TEST],
      env: { ...process.env, FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: FRI_ORDINARY_BUNDLE_SUFFIX },
      stage: 'fri-ordinary-xcuitest'
    }
  ];
}

function inspectAcceptanceApp(evidenceRoot, repoRoot) {
  const outputPath = path.join(evidenceRoot, `installed-app-${timestamp()}.json`);
  execute('xcrun', ['devicectl', 'device', 'info', 'apps',
    '--device', FRI_COREDEVICE_ID, '--bundle-id', FRI_ORDINARY_APP_ID,
    '--json-output', outputPath], { cwd: repoRoot, stage: 'fri-ordinary-app-inspection' });
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  return report.result?.apps?.length === 1;
}

function removeAcceptanceApp(evidenceRoot, repoRoot) {
  if (!inspectAcceptanceApp(evidenceRoot, repoRoot)) return;
  execute('xcrun', ['devicectl', 'device', 'uninstall', 'app',
    '--device', FRI_COREDEVICE_ID, FRI_ORDINARY_APP_ID], {
    cwd: repoRoot, stage: 'fri-ordinary-app-cleanup'
  });
  if (inspectAcceptanceApp(evidenceRoot, repoRoot)) {
    throw new Error(`Fri acceptance app remains installed: ${FRI_ORDINARY_APP_ID}`);
  }
}

export async function runFriOrdinaryJourney({
  evidenceRoot,
  repoRoot = process.cwd(),
  readiness = createFriPhysicalReadinessAdapter(),
  run = execute
}) {
  if (!fs.existsSync(FRI_XCUITEST_RUNNER)) {
    throw new Error(`Fixed Fri XCUITest runner is missing: ${FRI_XCUITEST_RUNNER}`);
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await readiness();
  removeAcceptanceApp(evidenceRoot, repoRoot);
  let journeyError;
  try {
    for (const entry of buildFriOrdinaryJourneyCommands({ evidenceRoot, repoRoot })) {
      run(entry.command, entry.args, { cwd: repoRoot, env: entry.env, stage: entry.stage });
    }
  } catch (error) {
    journeyError = error;
  }
  try {
    removeAcceptanceApp(evidenceRoot, repoRoot);
  } catch (cleanupError) {
    if (journeyError) throw new AggregateError([journeyError, cleanupError],
      'Fri ordinary journey and exact acceptance app cleanup both failed.');
    throw cleanupError;
  }
  if (journeyError) throw journeyError;
  return { evidenceRoot, testIdentifier: FRI_ORDINARY_TEST };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const repoRoot = process.cwd();
  const evidenceRoot = path.resolve(option(process.argv.slice(2), '--artifacts-dir')
    ?? path.join(repoRoot, '.tmp/artifacts/t162-fri-ordinary-journey', timestamp()));
  const result = await runFriOrdinaryJourney({ evidenceRoot, repoRoot });
  console.log(`[fri-ordinary-journey] status=success evidence=${result.evidenceRoot}`);
}
