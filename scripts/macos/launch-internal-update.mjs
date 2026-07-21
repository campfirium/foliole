#!/usr/bin/env node
/* global console, process */

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';

import { enqueueInternalRevision } from './internal-update-queue.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');
const STATE_ROOT = path.join(REPOSITORY_ROOT, '.tmp/macos/internal-update');
const WORKER_PATH = path.join(import.meta.dirname, 'run-internal-update-coordinator.mjs');

function assertSuccess(label, result) {
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
  return result;
}

export function assertInternalSigningAvailable(run = spawnSync) {
  const result = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8'
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0 || !output.includes('Apple Development:')) {
    throw new Error(
      'Foliole Internal update requires the host macOS context with an Apple Development identity'
    );
  }
}

export function resolveInternalRevision(repositoryRoot = REPOSITORY_ROOT, run = spawnSync) {
  const result = assertSuccess('resolve Internal revision', run('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  }));
  const revision = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(revision)) throw new Error('Internal revision must be a full Git commit');
  return revision;
}

export function createInternalLaunchCommand(options) {
  return {
    args: [
      '-k', options.lockPath, process.execPath, options.workerPath,
      '--revision', options.revision, '--repository', options.repositoryRoot,
      '--state-root', options.stateRoot
    ],
    bin: '/usr/bin/lockf'
  };
}

export async function launchInternalUpdate(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
  const stateRoot = options.stateRoot ?? STATE_ROOT;
  const workerPath = options.workerPath ?? WORKER_PATH;
  const start = options.start ?? spawn;
  const makeDirectory = options.makeDirectory ?? mkdirSync;
  const openFile = options.openFile ?? openSync;
  const closeFile = options.closeFile ?? closeSync;
  const revision = options.revision ?? resolveInternalRevision(repositoryRoot, options.run);
  const environment = options.environment ?? process.env;
  const originThreadId = options.originThreadId ?? environment.CODEX_THREAD_ID;
  if ((options.platform ?? process.platform) !== 'darwin') {
    return { reason: 'unsupported-platform', revision, status: 'skipped' };
  }
  (options.verifySigning ?? assertInternalSigningAvailable)(options.run);
  makeDirectory(stateRoot, { recursive: true });
  (options.enqueue ?? enqueueInternalRevision)(
    stateRoot, revision, options.requestedAt, originThreadId
  );
  const logPath = path.join(stateRoot, 'build.log');
  const descriptor = openFile(logPath, 'a');
  const command = createInternalLaunchCommand({
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
  return { logPath, originThreadId, pid: child.pid, revision, status: 'dispatched' };
}

async function main() {
  const result = await launchInternalUpdate();
  const detail = result.status === 'skipped'
    ? `reason=${result.reason}`
    : [
      `pid=${result.pid}`, `log=${result.logPath}`,
      result.originThreadId ? `origin-thread=${result.originThreadId}` : null
    ].filter(Boolean).join(' ');
  console.log(`[internal-update] ${result.status} revision=${result.revision} ${detail}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
