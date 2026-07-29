#!/usr/bin/env node
/* global console */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const PIN_PATTERN = /^npm@(\d+\.\d+\.\d+)(?:\+.+)?$/u;

export function readPinnedNpm(repoRoot = REPO_ROOT) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const descriptor = packageJson.packageManager;
  const match = typeof descriptor === 'string' ? PIN_PATTERN.exec(descriptor) : null;
  if (!match) throw new Error('package.json must pin packageManager as npm@<exact-version>');
  return { descriptor, version: match[1] };
}

function executable(name, platform) {
  return platform === 'win32' ? `${name}.cmd` : name;
}

function runChecked(runner, command, args, options) {
  const result = runner(command, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
  return result;
}

export function verifyPinnedNpm(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const runner = options.runner ?? spawnSync;
  const platform = options.platform ?? process.platform;
  const log = options.log ?? console.log;
  const pinned = readPinnedNpm(repoRoot);
  const result = runChecked(runner, executable('npm', platform), ['--version'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  const actualVersion = result.stdout.trim();
  if (actualVersion !== pinned.version) {
    throw new Error(`expected ${pinned.descriptor}, received npm@${actualVersion}`);
  }
  log(`[pinned-npm] ok: ${pinned.descriptor}`);
  return pinned;
}

export function activatePinnedNpm(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const runner = options.runner ?? spawnSync;
  const platform = options.platform ?? process.platform;
  const pinned = readPinnedNpm(repoRoot);
  const command = executable('corepack', platform);
  const runOptions = { cwd: repoRoot, stdio: 'inherit' };
  runChecked(runner, command, ['enable', 'npm'], runOptions);
  runChecked(runner, command, ['install', '--global', pinned.descriptor], runOptions);
  return verifyPinnedNpm({ ...options, repoRoot, runner, platform });
}

function main() {
  const command = process.argv[2];
  if (command === 'activate') return activatePinnedNpm();
  if (command === 'verify') return verifyPinnedNpm();
  throw new Error('usage: node scripts/quality/pinned-npm.mjs <activate|verify>');
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryUrl) {
  try {
    main();
  } catch (error) {
    console.error(`[pinned-npm] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
