// @vitest-environment node
/* global process */

import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { afterEach, expect, it, vi } from 'vitest';

import { ARTIFACT_ROOT, CACHE_ROOT } from './local-artifact-cache-retention.mjs';
import {
  prepareCacheEntry,
  withArtifactRun
} from './local-artifact-cache-production.mjs';

const fixtureRoots = [];
const DAY_MS = 24 * 60 * 60 * 1000;

function makeFixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'foliole-production-retention-'));
  fixtureRoots.push(rootDir);
  return rootDir;
}

function makeOldArtifact(rootDir, name, nowMs) {
  const entry = path.join(rootDir, ARTIFACT_ROOT, 'fixture', name);
  mkdirSync(entry, { recursive: true });
  writeFileSync(path.join(entry, 'payload'), 'old');
  const oldTime = new Date(nowMs - 2 * DAY_MS);
  utimesSync(entry, oldTime, oldTime);
  return entry;
}

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

it('refreshes the active cache entry before maintaining other local storage', () => {
  const rootDir = makeFixture();
  const nowMs = Date.UTC(2026, 7, 5);
  const oldArtifact = makeOldArtifact(rootDir, 'expired', nowMs);
  const oldTmp = path.join(rootDir, '.tmp', 'seven-days');
  mkdirSync(oldTmp, { recursive: true });
  utimesSync(oldTmp, new Date(nowMs - 7 * DAY_MS), new Date(nowMs - 7 * DAY_MS));
  const existingCache = path.join(rootDir, CACHE_ROOT, 'ios-runtime-contract');
  mkdirSync(existingCache, { recursive: true });
  const staleTime = new Date(nowMs - 31 * DAY_MS);
  utimesSync(existingCache, staleTime, staleTime);

  const entryPath = prepareCacheEntry({ entryName: 'ios-runtime-contract', nowMs, rootDir });

  expect(entryPath).toBe(path.join(rootDir, CACHE_ROOT, 'ios-runtime-contract'));
  expect(statSync(entryPath).mtimeMs).toBe(nowMs);
  expect(() => statSync(oldArtifact)).toThrow();
  expect(() => statSync(oldTmp)).toThrow();
});

it('blocks production when maintenance cannot delete a candidate', async () => {
  const rootDir = makeFixture();
  const nowMs = Date.UTC(2026, 7, 5);
  makeOldArtifact(rootDir, 'blocked', nowMs);
  const produce = vi.fn();

  await expect(withArtifactRun({
    categoryName: 'fixture', runName: 'next-run', nowMs,
    removeEntry: () => { throw new Error('permission denied'); }, rootDir
  }, produce)).rejects.toThrow('maintenance failed');
  expect(produce).not.toHaveBeenCalled();
});

it('refreshes an artifact batch after successful or failed production', async () => {
  const rootDir = makeFixture();
  const categoryName = 'ios-bridge-acceptance';
  const runName = 'sync-pack-runtime';
  const entryPath = path.join(rootDir, ARTIFACT_ROOT, categoryName, runName);

  await expect(withArtifactRun({ categoryName, runName, rootDir }, async () => {
    mkdirSync(entryPath, { recursive: true });
    throw new Error('acceptance failed');
  })).rejects.toThrow('acceptance failed');

  expect(Date.now() - statSync(entryPath).mtimeMs).toBeLessThan(5_000);
});

it('keeps one shared cache while two production runs expire older storage', async () => {
  const rootDir = makeFixture();
  const nowMs = Date.UTC(2026, 7, 5);
  const oldRun = makeOldArtifact(rootDir, 'old-run', nowMs);
  const cacheEntry = prepareCacheEntry({ entryName: 'shared-runtime', nowMs, rootDir });
  await withArtifactRun({ categoryName: 'fixture', nowMs, rootDir, runName: 'first' }, async () => {
    mkdirSync(path.join(rootDir, ARTIFACT_ROOT, 'fixture', 'first'), { recursive: true });
  });
  await withArtifactRun({ categoryName: 'fixture', nowMs, rootDir, runName: 'second' }, async () => {
    mkdirSync(path.join(rootDir, ARTIFACT_ROOT, 'fixture', 'second'), { recursive: true });
  });

  expect(() => statSync(oldRun)).toThrow();
  expect(statSync(cacheEntry).isDirectory()).toBe(true);
  expect(path.dirname(cacheEntry)).toBe(path.join(rootDir, CACHE_ROOT));
});

it('sweeps eligible transient worktrees on repeated production maintenance', () => {
  const rootDir = makeFixture();
  execFileSync('git', ['init', '--initial-branch=dev', rootDir]);
  git(rootDir, 'config', 'user.email', 'test@example.com');
  git(rootDir, 'config', 'user.name', 'Test');
  writeFileSync(path.join(rootDir, 'README.md'), 'base\n');
  git(rootDir, 'add', 'README.md');
  git(rootDir, 'commit', '-m', 'base');
  const transient = path.join(path.dirname(rootDir), `${path.basename(rootDir)}-acceptance`);
  fixtureRoots.push(transient);
  const createdAt = '2026-08-01T00:00:00.000Z';
  execFileSync(process.execPath, [
    path.resolve('scripts/diagnostics/transient-worktree-lifecycle.mjs'), 'create',
    '--repo', rootDir, '--path', transient, '--kind', 'acceptance', '--target', 'dev'
  ], { env: { ...process.env, TZ: 'UTC' } });
  const marker = path.join(git(transient, 'rev-parse', '--absolute-git-dir'),
    'foliole-transient-worktree.json');
  const value = JSON.parse(readFileSync(marker, 'utf8'));
  writeFileSync(marker, `${JSON.stringify({ ...value, createdAt }, null, 2)}\n`);

  const nowMs = Date.parse('2026-08-10T00:00:00.000Z');
  const first = prepareCacheEntry({ entryName: 'shared-runtime', nowMs, rootDir });
  const second = prepareCacheEntry({ entryName: 'shared-runtime', nowMs, rootDir });

  expect(first).toBe(second);
  expect(existsSync(transient)).toBe(false);
  expect(git(rootDir, 'worktree', 'list', '--porcelain')).not.toContain(transient);
});

it('keeps the generic resource gate free of retention side effects', () => {
  const source = readFileSync(path.resolve('scripts/with-resource-gate.mjs'), 'utf8');
  expect(source).not.toContain('local-artifact-cache');
  expect(source).not.toContain('runRetention');
});
