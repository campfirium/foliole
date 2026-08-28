#!/usr/bin/env node
/* global console, process */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertQualityCommandAllowed } from '../quality/quality-command-contracts.mjs';
import { resolveAcceptanceScenario } from './ios-sync-pack-acceptance-runner.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUNNER = path.join(REPO_ROOT, 'scripts/ios/ios-bootstrap-acceptance.mjs');
const HOSTED_SCENARIOS = new Set([
  'sync-group-signed-transport',
  'content-resource-read',
  'state-writeback-runtime',
  'sync-pack-runtime',
  'foreground-sync-lifecycle'
]);

export function parseHostedAcceptanceBucket(value) {
  let scenarios;
  try {
    scenarios = JSON.parse(value ?? '');
  } catch {
    throw new Error('iOS hosted acceptance bucket must be a JSON scenario array.');
  }
  if (!Array.isArray(scenarios) || scenarios.length === 0 || scenarios.length > 2) {
    throw new Error('iOS hosted acceptance bucket must contain one or two scenarios.');
  }
  const resolved = scenarios.map((scenario) => {
    if (!HOSTED_SCENARIOS.has(scenario)) throw new Error(`Unknown hosted iOS scenario: ${scenario}`);
    return resolveAcceptanceScenario(scenario);
  });
  if (new Set(resolved).size !== resolved.length) {
    throw new Error('iOS hosted acceptance bucket contains a duplicate scenario.');
  }
  return resolved;
}

export function runHostedAcceptanceBucket(scenarios, runScenario = runAcceptanceScenario) {
  for (const scenario of scenarios) runScenario(scenario);
}

function runAcceptanceScenario(scenario) {
  const result = spawnSync(process.execPath, [RUNNER], {
    cwd: REPO_ROOT,
    env: { ...process.env, FOLIOLE_IOS_ACCEPTANCE_SCENARIO: scenario },
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`iOS Simulator scenario failed: ${scenario} (exit ${result.status ?? 'signal'})`);
  }
}

function main() {
  assertQualityCommandAllowed('runner:ios-simulator-bucket');
  const scenarios = parseHostedAcceptanceBucket(process.env.FOLIOLE_IOS_ACCEPTANCE_SCENARIOS);
  runHostedAcceptanceBucket(scenarios);
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
