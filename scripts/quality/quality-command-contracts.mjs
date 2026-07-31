#!/usr/bin/env node
/* global console, process */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HOSTED_ONLY_PACKAGES,
  HOSTED_RUNNERS,
  LOCAL_QUICK_PACKAGES,
  RELEASE_CONTROLS
} from './quality-command-contract-data.mjs';

export const COMMAND_CLASSIFICATIONS = [
  'local-quick',
  'hosted-only',
  'orchestrator',
  'release-control'
];
const EXACT_HOST_PACKAGE_CHECKS = new Set([
  'android:sync', 'android:host:lint', 'android:host:test',
  'ios:sync:preflight', 'ios:sqlite-capability:gate', 'sync:sql-surface:scan'
]);

function hostedRunner(name) {
  if (name === 'sync:sql-surface:scan') return 'runner:sql-surface-scan';
  if (name === 'ios:sqlite-capability:gate') return 'runner:ios-sqlite-capability';
  if (name.startsWith('android:')) return 'runner:android-host-quality';
  if (!name.startsWith('quality:')) return 'runner:aggregate-package-check';
  if (name.startsWith('quality:release:repair')) return 'runner:quality-gate-repair';
  if (name === 'quality:ios:contract') return 'runner:ios-runtime-contract';
  if (name === 'quality:ios:simulator') return 'runner:ios-simulator';
  if (name.startsWith('quality:ios')) return 'runner:aggregate-package-check';
  return 'runner:quality-gate-target';
}

function contract(name, classification, target, overrides = {}) {
  return {
    name,
    classification,
    target,
    runner: overrides.runner ?? '',
    surface: overrides.surface ?? 'internal',
    requiredState: overrides.requiredState ?? '',
    requiredOwner: overrides.requiredOwner ?? '',
    localQuickCriteria: {
      targetKnownBeforeStart: classification === 'local-quick',
      quickCostBounded: classification === 'local-quick',
      noUnknownAggregate: classification === 'local-quick',
      noPersistentExternalMutation: classification === 'local-quick',
      notFormalHostedEvidence: classification === 'local-quick'
    }
  };
}

const CONTRACTS = [
  ...LOCAL_QUICK_PACKAGES.map(([name, target]) => contract(
    name,
    'local-quick',
    target,
    {
      runner: name === 'quality:fast' ? 'runner:quality-fast' : '',
      surface: name.startsWith('hook:') ? 'hook' : 'npm'
    }
  )),
  contract('hook:pre-push', 'local-quick', 'commit sequence plus affected fixed contracts', { surface: 'hook' }),
  contract('runner:quality-fast', 'local-quick', 'run-quality-fast.mjs'),
  ...HOSTED_ONLY_PACKAGES.map(([name, target]) => contract(name, 'hosted-only', target, {
    runner: hostedRunner(name),
    surface: 'npm'
  })),
  ...HOSTED_RUNNERS.map(([name, target]) => contract(name, 'hosted-only', target)),
  contract('quality:remote', 'orchestrator', 'dev-only scoped GitHub recheck', {
    runner: 'runner:remote-quality',
    surface: 'npm'
  }),
  contract('runner:remote-quality', 'orchestrator', 'remote-quality.mjs'),
  ...RELEASE_CONTROLS.map(([name, requiredState]) => contract(
    name,
    'release-control',
    'one named release-state mutation',
    { requiredOwner: 'pinned-release-task', requiredState }
  ))
];

export const QUALITY_COMMAND_CONTRACTS = new Map(CONTRACTS.map((entry) => [entry.name, entry]));

export function publicQualityPackageCommands() {
  return CONTRACTS
    .filter((entry) => entry.surface === 'npm')
    .map((entry) => entry.name)
    .sort();
}

export function isPublicQualityPackageCommand(name) {
  return (/^(?:appearance:colors:check|deps:|check:|scripts:domains:check|windows:console:guard|native-dialog:guard|copy:guard|validate:|lint(?::|$)|typecheck(?::|$)|test:|quality:)/u.test(name) || EXACT_HOST_PACKAGE_CHECKS.has(name)) &&
    !name.startsWith('test:e2e');
}

export function assertQualityCommandAllowed(name, options = {}) {
  const entry = QUALITY_COMMAND_CONTRACTS.get(name);
  if (!entry) throw new Error(`unregistered quality or release command: ${name}`);
  const env = options.env ?? process.env;
  if (entry.classification === 'hosted-only') {
    if (env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted') {
      throw new Error(`${name} is hosted-only and requires a GitHub-hosted Actions runner`);
    }
  }
  if (entry.classification === 'orchestrator' && env.GITHUB_ACTIONS === 'true') {
    throw new Error(`${name} is a local orchestrator and cannot run inside GitHub Actions`);
  }
  if (entry.classification === 'release-control' && options.state !== entry.requiredState) {
    throw new Error(`${name} requires release state: ${entry.requiredState}`);
  }
  if (entry.classification === 'release-control' && options.owner !== entry.requiredOwner) {
    throw new Error(`${name} requires owner: ${entry.requiredOwner}`);
  }
  return entry;
}

function main() {
  const [action = '', name = '', ...args] = process.argv.slice(2);
  if (action !== 'allow' || !name) {
    throw new Error('usage: quality-command-contracts.mjs allow <name> [--state <state>] [--owner <owner>]');
  }
  const stateIndex = args.indexOf('--state');
  const ownerIndex = args.indexOf('--owner');
  assertQualityCommandAllowed(name, {
    owner: ownerIndex >= 0 ? args[ownerIndex + 1] ?? '' : '',
    state: stateIndex >= 0 ? args[stateIndex + 1] ?? '' : ''
  });
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[quality-command-contract] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
