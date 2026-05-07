#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SYNC_PACK_PATH_PATTERN = /^(lib\/core\/sync\/syncPack|electron\/database\/syncPack|electron\/sync\/syncPack|src\/shared\/platform\/companionSyncPack)/u;
const LINTABLE_FILE_PATTERN = /\.(cjs|js|jsx|mjs|ts|tsx)$/u;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `${command} ${args.join(' ')} failed`);
  }
  return result.stdout ?? '';
}

function stagedFiles(diffFilter) {
  return run('git', ['diff', '--cached', '--name-only', `--diff-filter=${diffFilter}`, '--', '.'])
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean);
}

function hasPackageScript(scriptName) {
  try {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    return Boolean(packageJson.scripts?.[scriptName]);
  } catch {
    return false;
  }
}

function runStep(label, command, args) {
  console.log(`[pre-commit-validation] ${label}`);
  run(command, args, { stdio: 'inherit' });
}

function runSyncPackCheckIfNeeded(files) {
  if (!files.some((file) => SYNC_PACK_PATH_PATTERN.test(file))) {
    return;
  }
  if (!hasPackageScript('test:sync-pack')) {
    throw new Error('staged sync-pack changes require package script test:sync-pack.');
  }
  runStep('sync-pack changes detected; running test:sync-pack', 'npm', ['run', 'test:sync-pack']);
}

function runAddedFileChecks(files) {
  if (files.length === 0) {
    return;
  }
  runStep('added or renamed files detected; checking file budget', 'node', ['scripts/check-file-budget.mjs', ...files]);
  const lintableFiles = files.filter((file) => LINTABLE_FILE_PATTERN.test(file));
  if (lintableFiles.length > 0) {
    runStep('linting added or renamed code files', 'bash', ['scripts/lint-changed.sh', ...lintableFiles]);
  }
}

function main() {
  const changedFiles = stagedFiles('ACMRTUXB');
  const addedOrRenamedFiles = stagedFiles('AR');
  runSyncPackCheckIfNeeded(changedFiles);
  runAddedFileChecks(addedOrRenamedFiles);
}

try {
  main();
} catch (error) {
  console.error(`[pre-commit-validation] error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
