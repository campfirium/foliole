#!/usr/bin/env node
/* global console, process */

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');
const STATE_ROOT = path.join(REPOSITORY_ROOT, '.tmp/macos/dogfood-daily');
const WORKER_PATH = path.join(import.meta.dirname, 'run-dogfood-daily-build.mjs');

function assertSuccess(label, result) {
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
  return result;
}

export function resolveDogfoodRevision(repositoryRoot = REPOSITORY_ROOT, run = spawnSync) {
  const result = assertSuccess('resolve Dogfood revision', run('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  }));
  const revision = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(revision)) throw new Error('Dogfood revision must be a full Git commit');
  return revision;
}

export function createDogfoodLaunchCommand(options) {
  return {
    args: [
      '-k', options.lockPath, process.execPath, options.workerPath,
      '--revision', options.revision, '--repository', options.repositoryRoot,
      '--state-root', options.stateRoot
    ],
    bin: '/usr/bin/lockf'
  };
}

export async function launchDogfoodDailyBuild(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
  const stateRoot = options.stateRoot ?? STATE_ROOT;
  const workerPath = options.workerPath ?? WORKER_PATH;
  const start = options.start ?? spawn;
  const makeDirectory = options.makeDirectory ?? mkdirSync;
  const openFile = options.openFile ?? openSync;
  const closeFile = options.closeFile ?? closeSync;
  const revision = options.revision ?? resolveDogfoodRevision(repositoryRoot, options.run);
  if ((options.platform ?? process.platform) !== 'darwin') {
    return { reason: 'unsupported-platform', revision, status: 'skipped' };
  }
  makeDirectory(stateRoot, { recursive: true });
  const logPath = path.join(stateRoot, 'build.log');
  const descriptor = openFile(logPath, 'a');
  const command = createDogfoodLaunchCommand({
    lockPath: path.join(stateRoot, 'build.lock'), repositoryRoot, revision, stateRoot, workerPath
  });
  let child;
  try {
    child = start(command.bin, command.args, {
      cwd: repositoryRoot,
      detached: true,
      stdio: ['ignore', descriptor, descriptor]
    });
    await once(child, 'spawn');
    child.unref();
  } finally {
    closeFile(descriptor);
  }
  return { logPath, pid: child.pid, revision };
}

async function main() {
  const result = await launchDogfoodDailyBuild();
  const detail = result.status === 'skipped' ? `reason=${result.reason}` : `pid=${result.pid}`;
  console.log(`[dogfood-daily] ${result.status ?? 'dispatched'} revision=${result.revision} ${detail}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
