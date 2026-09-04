#!/usr/bin/env node
/* global console, process */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  canonicalWorktreePath,
  pathsReferToSameLocation
} from './transient-worktree-path-identity.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDirectory, '../..');
const MARKER_NAME = 'foliole-transient-worktree.json';
const DAY_MS = 24 * 60 * 60 * 1000;

function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

function parseWorktrees(output) {
  return output.split(/\n\n/u).filter(Boolean).map((block) => {
    const entry = {};
    for (const line of block.split('\n')) {
      const separator = line.indexOf(' ');
      const key = separator < 0 ? line : line.slice(0, separator);
      entry[key] = separator < 0 ? true : line.slice(separator + 1);
    }
    return entry;
  });
}

function listWorktrees(repoRoot) {
  return parseWorktrees(git(repoRoot, ['worktree', 'list', '--porcelain']));
}

function findWorktree(repoRoot, worktreePath) {
  const entry = listWorktrees(repoRoot)
    .find((item) => pathsReferToSameLocation(item.worktree, worktreePath));
  if (!entry) throw new Error(`not a registered worktree: ${worktreePath}`);
  return entry;
}

function markerPath(worktreePath) {
  return join(git(worktreePath, ['rev-parse', '--absolute-git-dir']), MARKER_NAME);
}

function lockPath(worktreePath) {
  return join(git(worktreePath, ['rev-parse', '--absolute-git-dir']), 'locked');
}

function readMarker(worktreePath) {
  const path = markerPath(worktreePath);
  if (!existsSync(path)) throw new Error(`transient marker missing: ${worktreePath}`);
  const marker = JSON.parse(readFileSync(path, 'utf8'));
  if (
    marker.schemaVersion !== 1
    || !['acceptance', 'development'].includes(marker.kind)
    || typeof marker.targetRef !== 'string'
    || !Number.isFinite(Date.parse(marker.createdAt))
    || !pathsReferToSameLocation(marker.worktreePath, worktreePath)
  ) {
    throw new Error(`invalid transient marker: ${worktreePath}`);
  }
  return marker;
}

function assertKind(entry, kind) {
  if (!['acceptance', 'development'].includes(kind)) {
    throw new Error('kind must be acceptance or development');
  }
  if (kind === 'acceptance' && !entry.detached) {
    throw new Error('acceptance worktree must be detached');
  }
  if (kind === 'development' && !entry.branch) {
    throw new Error('development worktree must have a branch');
  }
}

export function registerTransientWorktree({
  createdAt = new Date().toISOString(),
  kind,
  repoRoot = defaultRepoRoot,
  targetRef,
  worktreePath
}) {
  const entry = findWorktree(repoRoot, worktreePath);
  if (pathsReferToSameLocation(repoRoot, worktreePath)) {
    throw new Error('main worktree cannot be transient');
  }
  assertKind(entry, kind);
  git(repoRoot, ['rev-parse', '--verify', `${targetRef}^{commit}`]);
  const marker = {
    branch: entry.branch === true ? null : entry.branch ?? null,
    createdAt,
    kind,
    schemaVersion: 1,
    targetRef,
    worktreePath: canonicalWorktreePath(worktreePath)
  };
  writeFileSync(markerPath(worktreePath), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  return marker;
}

export function createTransientWorktree({
  branch,
  kind,
  repoRoot = defaultRepoRoot,
  sourceRef,
  targetRef,
  worktreePath
}) {
  if (!['acceptance', 'development'].includes(kind)) {
    throw new Error('kind must be acceptance or development');
  }
  if (kind === 'development' && !branch) {
    throw new Error('development branch is required');
  }
  if (kind === 'acceptance' && branch) {
    throw new Error('acceptance worktree cannot have a branch');
  }
  const source = sourceRef ?? targetRef;
  git(repoRoot, ['rev-parse', '--verify', `${targetRef}^{commit}`]);
  git(repoRoot, ['rev-parse', '--verify', `${source}^{commit}`]);
  const addArguments = kind === 'acceptance'
    ? ['worktree', 'add', '--detach', worktreePath, source]
    : ['worktree', 'add', '-b', branch, worktreePath, source];
  git(repoRoot, addArguments);
  try {
    return registerTransientWorktree({ kind, repoRoot, targetRef, worktreePath });
  } catch (error) {
    git(repoRoot, ['worktree', 'remove', '--force', worktreePath]);
    if (kind === 'development') git(repoRoot, ['branch', '-D', branch]);
    throw error;
  }
}

function assertReadyToRemove(repoRoot, worktreePath, marker) {
  const status = git(worktreePath, ['status', '--porcelain', '--untracked-files=all']);
  if (status) throw new Error(`transient worktree is dirty: ${worktreePath}`);
  const head = git(worktreePath, ['rev-parse', 'HEAD']);
  const result = spawnSync(
    'git',
    ['-C', repoRoot, 'merge-base', '--is-ancestor', head, marker.targetRef],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`transient HEAD is not reachable from ${marker.targetRef}: ${worktreePath}`);
  }
}

export function finishTransientWorktree({ repoRoot = defaultRepoRoot, worktreePath }) {
  const entry = findWorktree(repoRoot, worktreePath);
  const marker = readMarker(worktreePath);
  assertReadyToRemove(repoRoot, worktreePath, marker);
  if (entry.locked) git(repoRoot, ['worktree', 'unlock', worktreePath]);
  git(repoRoot, ['worktree', 'remove', '--force', worktreePath]);
  if (marker.kind === 'development' && marker.branch) {
    git(repoRoot, ['branch', '-d', marker.branch.replace(/^refs\/heads\//u, '')]);
  }
  git(repoRoot, ['worktree', 'prune']);
  return marker;
}

export function sweepTransientWorktrees({
  days = 7,
  nowMs = Date.now(),
  repoRoot = defaultRepoRoot
} = {}) {
  if (!Number.isFinite(days) || days < 0) throw new Error('days must be a non-negative number');
  const removed = [];
  const failures = [];
  for (const entry of listWorktrees(repoRoot)) {
    if (!existsSync(entry.worktree)) continue;
    try {
      const path = markerPath(entry.worktree);
      if (!existsSync(path)) continue;
      const marker = readMarker(entry.worktree);
      const expiryMs = nowMs - days * DAY_MS;
      if (Date.parse(marker.createdAt) > expiryMs) continue;
      const activeLock = entry.locked && statSync(lockPath(entry.worktree)).mtimeMs > expiryMs;
      if (activeLock) continue;
      const canonicalPath = canonicalWorktreePath(entry.worktree);
      finishTransientWorktree({ repoRoot, worktreePath: entry.worktree });
      removed.push(canonicalPath);
    } catch (error) {
      failures.push({ message: error.message, path: entry.worktree });
    }
  }
  return { failures, ok: failures.length === 0, removed };
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`);
  return args[index + 1];
}

function main(args = process.argv.slice(2)) {
  const command = args[0];
  const repoRoot = resolve(args.includes('--repo') ? argumentValue(args, '--repo') : defaultRepoRoot);
  if (command === 'create') {
    return createTransientWorktree({
      ...(args.includes('--branch') ? { branch: argumentValue(args, '--branch') } : {}),
      kind: argumentValue(args, '--kind'),
      repoRoot,
      ...(args.includes('--source') ? { sourceRef: argumentValue(args, '--source') } : {}),
      targetRef: argumentValue(args, '--target'),
      worktreePath: argumentValue(args, '--path')
    });
  }
  if (command === 'finish') {
    return finishTransientWorktree({ repoRoot, worktreePath: argumentValue(args, '--path') });
  }
  if (command === 'sweep') {
    const days = args.includes('--days') ? Number(argumentValue(args, '--days')) : 7;
    return sweepTransientWorktrees({ days, repoRoot });
  }
  throw new Error('command must be create, finish, or sweep');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(main()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
