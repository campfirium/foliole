#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createFriPhysicalReadinessAdapter } from './fri-physical-readiness.mjs';

export const FRI_COREDEVICE_ID = 'CB302BF0-6B5B-5737-8DA8-21F8081E19E7';
export const FRI_DEV_APP_ID = 'com.foliole.ios.devworkflow';
export const FRI_DEV_BUNDLE_SUFFIX = '.devworkflow';
export const FRI_DEV_TEST =
  'AppPhysicalUITests/FoliolePhysicalDevWorkflowUITests/testOpensAndOperatesBrowse';
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

export function buildFriDevWorkflowCommands({ evidenceRoot, repoRoot }) {
  return [
    { command: 'npm', args: ['run', 'android:web:build'], stage: 'companion-build' },
    { command: 'npx', args: ['cap', 'sync', 'ios'], stage: 'capacitor-ios-sync' },
    {
      command: 'bash',
      args: [FRI_XCUITEST_RUNNER,
        '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'),
        '--scheme', 'AppPhysicalUITests',
        '--artifacts-dir', path.join(evidenceRoot, 'xcuitest'),
        '--keep-app-foreground', FRI_DEV_APP_ID,
        '--only-testing', FRI_DEV_TEST],
      env: { ...process.env, FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: FRI_DEV_BUNDLE_SUFFIX },
      stage: 'fri-dev-xcuitest'
    }
  ];
}

export async function runFriDevWorkflow({
  evidenceRoot,
  repoRoot = process.cwd(),
  readiness = createFriPhysicalReadinessAdapter(),
  run = execute
}) {
  if (!fs.existsSync(FRI_XCUITEST_RUNNER)) {
    throw new Error(`Fixed Fri XCUITest runner is missing: ${FRI_XCUITEST_RUNNER}`);
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const commands = buildFriDevWorkflowCommands({ evidenceRoot, repoRoot });
  for (const entry of commands.slice(0, 2)) {
    run(entry.command, entry.args, { cwd: repoRoot, env: entry.env, stage: entry.stage });
  }
  await readiness();
  for (const entry of commands.slice(2)) {
    run(entry.command, entry.args, { cwd: repoRoot, env: entry.env, stage: entry.stage });
  }
  return { evidenceRoot, testIdentifier: FRI_DEV_TEST };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const repoRoot = process.cwd();
  const evidenceRoot = path.resolve(option(process.argv.slice(2), '--artifacts-dir')
    ?? path.join(repoRoot, '.tmp/artifacts/t162-fri-dev-workflow', timestamp()));
  const result = await runFriDevWorkflow({ evidenceRoot, repoRoot });
  console.log(`[fri-dev-workflow] status=success evidence=${result.evidenceRoot}`);
}
