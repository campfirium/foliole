#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { isCommitOnRemote } from './git/remote-commit.mjs';
import { isAndroidSyncBoundaryPath, isSyncPackPath } from './lib/path-domains.mjs';

const ZERO_SHA = /^0{40}$/u;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: options.shell ?? false,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `${command} ${args.join(' ')} failed`);
  }
  return result.stdout ?? '';
}

function runGit(args) {
  return run('git', args);
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function parsePrePushInput(input) {
  return input
    .split(/\r?\n/u)
    .map((line) => line.trim().split(/\s+/u))
    .filter((parts) => parts.length >= 4)
    .map(([localRef, localSha, remoteRef, remoteSha]) => ({ localRef, localSha, remoteRef, remoteSha }));
}

function splitFiles(output) {
  return output.split(/\r?\n/u).map((file) => file.trim()).filter(Boolean);
}

function filesForBranchUpdate(update) {
  if (ZERO_SHA.test(update.localSha) || !update.localRef.startsWith('refs/heads/')) {
    return [];
  }
  if (!ZERO_SHA.test(update.remoteSha)) {
    return splitFiles(runGit(['diff', '--name-only', `${update.remoteSha}..${update.localSha}`, '--', '.']));
  }
  if (isCommitOnRemote(update.localSha)) return [];
  return splitFiles(runGit(['log', '--first-parent', '--format=', '--name-only', update.localSha, '--', '.']));
}

function localChangedFiles() {
  const staged = splitFiles(runGit(['diff', '--cached', '--name-only', '--', '.']));
  const unstaged = splitFiles(runGit(['diff', '--name-only', '--', '.']));
  return [...staged, ...unstaged];
}

function affectedFiles(input) {
  const updates = parsePrePushInput(input);
  const files = updates.length > 0 ? updates.flatMap(filesForBranchUpdate) : localChangedFiles();
  return [...new Set(files)];
}

function runSyncPackCheckIfNeeded(files) {
  if (!files.some(isSyncPackPath)) {
    return;
  }
  console.log('[pre-push-affected-validation] sync-pack changes detected; running test:sync-pack');
  run(npmCommand(), ['run', 'test:sync-pack'], { shell: process.platform === 'win32', stdio: 'inherit' });
}

function runAndroidSyncBoundaryCheckIfNeeded(files) {
  if (!files.some(isAndroidSyncBoundaryPath)) {
    return;
  }
  console.log('[pre-push-affected-validation] Android sync boundary changes detected; running check:android-boundary');
  run(npmCommand(), ['run', 'check:android-boundary'], { shell: process.platform === 'win32', stdio: 'inherit' });
}

function main() {
  const input = process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
  const files = affectedFiles(input);
  runSyncPackCheckIfNeeded(files);
  runAndroidSyncBoundaryCheckIfNeeded(files);
}

try {
  main();
} catch (error) {
  console.error(`[pre-push-affected-validation] error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
