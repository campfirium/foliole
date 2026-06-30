#!/usr/bin/env node
/* global console, process, setTimeout */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_INTERVAL_MS = 30000;
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;

function printUsage() {
  console.error([
    'Usage: node scripts/wait-clean-files.mjs [--interval-ms <ms>] [--timeout-ms <ms>] [--allow-package-json-scripts-edit] <file...>',
    '',
    'Waits until all listed files are clean in the current Git working tree.',
    'With --allow-package-json-scripts-edit, package.json dirty changes outside scripts do not block.'
  ].join('\n'));
}

function parsePositiveInteger(rawValue, optionName) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${optionName} must be a non-negative integer`);
  }
  return value;
}

export function parseArgs(argv) {
  const files = [];
  let allowPackageJsonScriptsEdit = false;
  let intervalMs = DEFAULT_INTERVAL_MS;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--interval-ms') {
      intervalMs = parsePositiveInteger(argv[index + 1], arg);
      index += 1;
      continue;
    }
    if (arg === '--timeout-ms') {
      timeoutMs = parsePositiveInteger(argv[index + 1], arg);
      index += 1;
      continue;
    }
    if (arg === '--allow-package-json-scripts-edit') {
      allowPackageJsonScriptsEdit = true;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    files.push(arg);
  }

  if (files.length === 0) {
    throw new Error('At least one file is required');
  }

  return { allowPackageJsonScriptsEdit, files, intervalMs, timeoutMs };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function readDirtyStatus(files, { cwd = process.cwd() } = {}) {
  return execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all', '--', ...files], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trimEnd();
}

function parseStatusLinePath(line) {
  const rawPath = line.slice(3);
  const renameSeparator = ' -> ';
  return rawPath.includes(renameSeparator) ? rawPath.split(renameSeparator).at(-1) : rawPath;
}

function readHeadFile(file, { cwd = process.cwd() } = {}) {
  return execFileSync('git', ['show', `HEAD:${file}`], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function packageJsonScriptsMatch({ cwd = process.cwd(), file = 'package.json' } = {}) {
  try {
    const headPackageJson = JSON.parse(readHeadFile(file, { cwd }));
    const worktreePackageJson = JSON.parse(readFileSync(path.join(cwd, file), 'utf8'));
    return JSON.stringify(headPackageJson.scripts ?? {}) === JSON.stringify(worktreePackageJson.scripts ?? {});
  } catch {
    return false;
  }
}

function filterPackageJsonScriptsEditStatus(statusOutput, { allowPackageJsonScriptsEdit, cwd }) {
  if (!allowPackageJsonScriptsEdit || statusOutput.length === 0) {
    return statusOutput;
  }
  const packageJsonCanBeIgnored = packageJsonScriptsMatch({ cwd });
  return statusOutput
    .split('\n')
    .filter((line) => {
      if (!line.trim()) {
        return false;
      }
      return !(packageJsonCanBeIgnored && parseStatusLinePath(line) === 'package.json');
    })
    .join('\n');
}

function formatDirtyStatus(statusOutput) {
  return statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .join('\n');
}

export async function waitForCleanFiles({
  allowPackageJsonScriptsEdit = false,
  files,
  intervalMs = DEFAULT_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cwd = process.cwd(),
  now = () => Date.now(),
  readStatus = readDirtyStatus,
  wait = sleep
}) {
  const startedAt = now();

  while (true) {
    const statusOutput = filterPackageJsonScriptsEditStatus(readStatus(files, { cwd }), {
      allowPackageJsonScriptsEdit,
      cwd
    });
    if (statusOutput.length === 0) {
      return { status: 'clean' };
    }

    const elapsedMs = now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      return {
        dirtyStatus: formatDirtyStatus(statusOutput),
        status: 'timeout'
      };
    }

    console.error([
      '[wait-clean-files] waiting for dirty files to clear:',
      formatDirtyStatus(statusOutput)
    ].join('\n'));
    await wait(Math.min(intervalMs, timeoutMs - elapsedMs));
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[wait-clean-files] ${error.message}`);
    printUsage();
    return 2;
  }

  const result = await waitForCleanFiles(options);
  if (result.status === 'clean') {
    console.log('[wait-clean-files] clean');
    return 0;
  }

  console.error([
    '[wait-clean-files] timed out; files are still dirty:',
    result.dirtyStatus
  ].join('\n'));
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`[wait-clean-files] ${error.message}`);
    process.exitCode = 1;
  });
