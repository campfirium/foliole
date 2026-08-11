import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { digest } from './multi-device-sync-contract.mjs';
import { scenarioCatalog, scenarioCatalogDigest } from './multi-device-sync-scenario-catalog.mjs';
import { stageCatalog, stageCatalogDigest } from './multi-device-sync-stage-catalog.mjs';

const CONTROLLER_FILES = [
  'scripts/sync-group/multi-device-sync-contract.mjs',
  'scripts/sync-group/multi-device-sync-diagnostic.mjs',
  'scripts/sync-group/multi-device-sync-formal.mjs',
  'scripts/sync-group/multi-device-sync-host-readiness.mjs',
  'scripts/sync-group/multi-device-sync-stage-actions.mjs',
  'scripts/sync-group/multi-device-sync-scenario-catalog.mjs',
  'scripts/sync-group/multi-device-sync-stage-catalog.mjs',
  'scripts/sync-group/multi-device-sync-workspace.mjs'
];

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function controllerDigest(repoRoot) {
  const hash = createHash('sha256');
  for (const name of CONTROLLER_FILES) hash.update(name).update(fs.readFileSync(path.join(repoRoot, name)));
  return hash.digest('hex');
}

export function currentAcceptanceCandidate(repoRoot, mode = 'diagnostic') {
  const status = git(repoRoot, ['status', '--porcelain']);
  return {
    branch: git(repoRoot, ['branch', '--show-current']), clean: status === '',
    committed: true, controllerDigest: controllerDigest(repoRoot),
    criteriaDigest: digest({ deadlineMs: 45_000, hosts: ['macos-a', 'android-b', 'windows-c'],
      progressStallMs: 60_000, statuses: ['passed', 'blocked', 'failed', 'stalled', 'invalidated'] }),
    mode, revision: git(repoRoot, ['rev-parse', 'HEAD']),
    scenarioDigest: digest({ scenarios: scenarioCatalogDigest(), stages: stageCatalogDigest() }),
    treeDigest: git(repoRoot, ['rev-parse', 'HEAD^{tree}'])
  };
}

export function acceptanceControllerFiles() {
  return [...CONTROLLER_FILES];
}

export function acceptanceScenarioDefinition() {
  return { scenarios: scenarioCatalog(), stages: stageCatalog() };
}
