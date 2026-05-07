#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ZERO_SHA = /^0{40}$/u;
const SYNC_PACK_PATH_PATTERN = /^(lib\/core\/sync\/syncPack|electron\/database\/syncPack|electron\/sync\/syncPack|src\/shared\/platform\/companionSyncPack)/u;

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

function runGit(args) {
  return run('git', args);
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
  if (!files.some((file) => SYNC_PACK_PATH_PATTERN.test(file))) {
    return;
  }
  console.log('[pre-push-affected-validation] sync-pack changes detected; running test:sync-pack');
  run('npm', ['run', 'test:sync-pack'], { stdio: 'inherit' });
}

function main() {
  const input = process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
  runSyncPackCheckIfNeeded(affectedFiles(input));
}

try {
  main();
} catch (error) {
  console.error(`[pre-push-affected-validation] error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
