#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createFriPhysicalReadinessAdapter } from './fri-physical-readiness.mjs';
import { retainFriDevelopmentApps } from './fri-app-retention.mjs';

export const FRI_COREDEVICE_ID = 'CB302BF0-6B5B-5737-8DA8-21F8081E19E7';
export const FRI_DEV_APP_ID = 'com.foliole.ios.devworkflow';
export const FRI_DEV_BUNDLE_SUFFIX = '.devworkflow';
export const FRI_T219_APP_ID = 'com.foliole.ios.t219capacity';
export const FRI_T219_BUNDLE_SUFFIX = '.t219capacity';
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

export function buildFriDevWorkflowCommands({ evidenceRoot, repoRoot, runnerPath = FRI_XCUITEST_RUNNER, scenario = 'browse' }) {
  if (!['browse', 'library-capacity', 'library-capacity-workspace'].includes(scenario)) {
    throw new Error('Unsupported Fri development scenario.');
  }
  const capacity = scenario.startsWith('library-capacity');
  const method = scenario === 'library-capacity-workspace'
    ? 'testMeasuresLibraryWorkspaceCapacity' : 'testMeasuresLibraryCapacity';
  const appId = scenario === 'library-capacity-workspace' ? FRI_T219_APP_ID : FRI_DEV_APP_ID;
  const bundleSuffix = scenario === 'library-capacity-workspace'
    ? FRI_T219_BUNDLE_SUFFIX : FRI_DEV_BUNDLE_SUFFIX;
  const buildEnv = { ...process.env, VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: capacity ? '1' : '0',
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: capacity ? scenario : '' };
  const runnerArgs = [runnerPath,
    '--project', path.join(repoRoot, 'ios/App/App.xcodeproj'),
    '--scheme', 'AppPhysicalUITests',
    '--artifacts-dir', path.join(evidenceRoot, 'xcuitest'),
    '--only-testing', capacity ? FRI_DEV_TEST.replace('testOpensAndOperatesBrowse', method) : FRI_DEV_TEST];
  return [
    { command: 'npm', args: ['run', 'android:web:build'], env: buildEnv, stage: 'companion-build' },
    { command: 'npx', args: ['cap', 'sync', 'ios'], stage: 'capacitor-ios-sync' },
    {
      command: 'bash',
      args: [...runnerArgs, '--build-for-testing'],
      env: { ...process.env, FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundleSuffix },
      stage: 'fri-dev-xcuitest-build'
    },
    {
      command: 'bash',
      args: [...runnerArgs,
        '--test-without-building',
        '--keep-app-foreground', appId,
      ],
      env: { ...process.env, FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundleSuffix },
      stage: 'fri-dev-xcuitest-run'
    }
  ];
}

export async function runFriDevWorkflow({
  evidenceRoot,
  repoRoot = process.cwd(),
  readiness = createFriPhysicalReadinessAdapter(),
  retention = retainFriDevelopmentApps,
  runnerPath = FRI_XCUITEST_RUNNER,
  scenario = 'browse',
  run = execute
}) {
  if (!fs.existsSync(runnerPath)) {
    throw new Error(`Fixed Fri XCUITest runner is missing: ${runnerPath}`);
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const commands = buildFriDevWorkflowCommands({ evidenceRoot, repoRoot, runnerPath, scenario });
  for (const entry of commands.slice(0, 2)) {
    run(entry.command, entry.args, { cwd: repoRoot, env: entry.env, stage: entry.stage });
  }
  await readiness();
  await retention({
    evidenceRoot: path.join(evidenceRoot, 'fri-app-retention'),
    run
  });
  for (const entry of commands.slice(2)) {
    await run(entry.command, entry.args, { cwd: repoRoot, env: entry.env, stage: entry.stage });
  }
  return { evidenceRoot, testIdentifier: commands[2].args[commands[2].args.indexOf('--only-testing') + 1] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const repoRoot = process.cwd();
  const evidenceRoot = path.resolve(option(process.argv.slice(2), '--artifacts-dir')
    ?? path.join(repoRoot, '.tmp/artifacts/t162-fri-dev-workflow', timestamp()));
  const result = await runFriDevWorkflow({ evidenceRoot, repoRoot, scenario: option(process.argv.slice(2), '--scenario') ?? 'browse' });
  console.log(`[fri-dev-workflow] status=success evidence=${result.evidenceRoot}`);
}
