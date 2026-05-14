#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const LINTABLE_FILE_PATTERN = /\.(cjs|js|jsx|mjs|ts|tsx)$/u;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    input: options.input,
    stdio: options.stdio ?? (options.input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'])
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

function collectStagedFiles() {
  return stagedFiles('ACMR').filter((file) => !file.startsWith('.lab/'));
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
}

function runStagedCodeLint(files) {
  const lintableFiles = files.filter((file) => LINTABLE_FILE_PATTERN.test(file));
  if (lintableFiles.length === 0) {
    return;
  }
  runStep('linting staged code files', 'bash', ['scripts/lint-changed.sh', ...lintableFiles]);
}

function runCriticalTests(files) {
  if (files.length === 0 || !existsSync('scripts/quality-critical-test-routes.mjs')) {
    return;
  }
  const output = run('node', ['scripts/quality-critical-test-routes.mjs'], {
    input: `${files.join('\n')}\n`
  }).trim();
  if (!output) {
    return;
  }
  const tests = output.split(/\r?\n/u).filter(Boolean);
  runStep('running critical routed tests', 'npx', [
    'vitest',
    'run',
    '--reporter=dot',
    '--silent=passed-only',
    '--pool=threads',
    '--no-file-parallelism',
    ...tests
  ]);
}

function main() {
  const addedOrRenamedFiles = stagedFiles('AR');
  const files = collectStagedFiles();
  runAddedFileChecks(addedOrRenamedFiles);
  runStagedCodeLint(files);
  runCriticalTests(files);
}

try {
  main();
} catch (error) {
  console.error(`[pre-commit-validation] error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
