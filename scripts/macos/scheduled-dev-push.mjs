#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { submitScheduledPushBlockedHandoff } from './scheduled-dev-push-handoff.mjs';

const DEFAULT_REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');
const EXPECTED_BRANCH = 'dev';
const EXPECTED_UPSTREAM = 'origin/dev';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? DEFAULT_REPOSITORY_ROOT,
    encoding: 'utf8',
    env: options.env ?? process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`${options.label ?? command} failed (${result.status})${detail ? `: ${detail}` : ''}`);
  }
  return String(result.stdout ?? '').trim();
}

function createGit(repositoryRoot) {
  return (args, options = {}) => run('/usr/bin/git', args, { ...options, cwd: repositoryRoot });
}

export function classifyCommitDistance(output) {
  const match = String(output).trim().match(/^(\d+)\s+(\d+)$/u);
  if (!match) throw new Error(`Unexpected Git distance: ${String(output).trim()}`);
  const remoteOnly = Number(match[1]);
  const localOnly = Number(match[2]);
  if (remoteOnly > 0 && localOnly > 0) return { localOnly, remoteOnly, status: 'diverged' };
  if (remoteOnly > 0) return { localOnly, remoteOnly, status: 'remote-ahead' };
  if (localOnly > 0) return { localOnly, remoteOnly, status: 'ready' };
  return { localOnly, remoteOnly, status: 'current' };
}

export function inspectScheduledPush(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT;
  const gitCommand = options.git ?? createGit(repositoryRoot);
  const root = gitCommand(['rev-parse', '--show-toplevel'], { label: 'resolve repository root' });
  if (path.resolve(root) !== path.resolve(repositoryRoot)) {
    throw new Error(`Refusing unexpected repository root: ${root}`);
  }
  const branch = gitCommand(['branch', '--show-current'], { label: 'resolve branch' });
  if (branch !== EXPECTED_BRANCH) throw new Error(`Scheduled push requires branch ${EXPECTED_BRANCH}; found ${branch || 'detached HEAD'}`);
  const upstream = gitCommand(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    { label: 'resolve upstream' }
  );
  if (upstream !== EXPECTED_UPSTREAM) {
    throw new Error(`Scheduled push requires upstream ${EXPECTED_UPSTREAM}; found ${upstream}`);
  }
  gitCommand(['fetch', '--prune', 'origin', EXPECTED_BRANCH], { label: 'fetch origin/dev' });
  const state = classifyCommitDistance(gitCommand(
    ['rev-list', '--left-right', '--count', `${EXPECTED_UPSTREAM}...HEAD`],
    { label: 'compare origin/dev with HEAD' }
  ));
  return {
    ...state,
    remoteRevision: gitCommand(['rev-parse', EXPECTED_UPSTREAM], { label: 'resolve origin/dev revision' })
  };
}

export function executeScheduledPush(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT;
  const gitCommand = options.git ?? createGit(repositoryRoot);
  const state = inspectScheduledPush({ ...options, git: gitCommand });
  if (state.status === 'current') return { ...state, pushed: false };
  if (state.status !== 'ready') {
    if (!options.dryRun) {
      (options.blockedHandoff ?? submitScheduledPushBlockedHandoff)({ repositoryRoot, state });
    }
    throw new Error(
      `Scheduled push stopped: ${state.status} (remote-only=${state.remoteOnly}, local-only=${state.localOnly})`
    );
  }
  if (options.dryRun) return { ...state, pushed: false };
  gitCommand(['push', '--porcelain', 'origin', 'HEAD:dev'], { label: 'push origin/dev' });
  return { ...state, pushed: true };
}

function formatResult(result, dryRun) {
  if (result.status === 'current') return '[scheduled-dev-push] skipped: origin/dev is current';
  if (dryRun) return `[scheduled-dev-push] dry-run: ${result.localOnly} local commit(s) ready`;
  return `[scheduled-dev-push] pushed ${result.localOnly} commit(s)`;
}

function main() {
  const args = process.argv.slice(2);
  const repositoryIndex = args.indexOf('--repository');
  const repositoryRoot = repositoryIndex >= 0 ? args[repositoryIndex + 1] : DEFAULT_REPOSITORY_ROOT;
  if (!repositoryRoot) throw new Error('--repository requires an absolute path');
  const dryRun = args.includes('--dry-run');
  const result = executeScheduledPush({ dryRun, repositoryRoot });
  console.log(formatResult(result, dryRun));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    main();
  } catch (error) {
    console.error(`[scheduled-dev-push] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
