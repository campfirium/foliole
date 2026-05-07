#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';

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

function runStep(label, command, args) {
  console.log(`[pre-commit-validation] ${label}`);
  run(command, args, { stdio: 'inherit' });
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
  const addedOrRenamedFiles = stagedFiles('AR');
  runAddedFileChecks(addedOrRenamedFiles);
}

try {
  main();
} catch (error) {
  console.error(`[pre-commit-validation] error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
