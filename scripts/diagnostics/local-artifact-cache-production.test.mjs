// @vitest-environment node

import {
  mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync
} from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

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

afterEach(async () => {
  for (const root of fixtureRoots.splice(0)) {
    await rm(root, { force: true, maxRetries: 20, recursive: true, retryDelay: 250 });
  }
});

it('refreshes the requested cache while preserving unrelated old storage', () => {
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
  expect(readFileSync(path.join(oldArtifact, 'payload'), 'utf8')).toBe('old');
  expect(statSync(oldTmp).isDirectory()).toBe(true);
});

it('produces artifacts without deleting an unrelated build cache', async () => {
  const rootDir = makeFixture();
  const nowMs = Date.UTC(2026, 7, 5);
  const cache = path.join(rootDir, CACHE_ROOT, 'ios-physical-acceptance');
  mkdirSync(cache, { recursive: true });
  writeFileSync(path.join(cache, 'build.db'), 'active build');
  utimesSync(cache, new Date(nowMs - 31 * DAY_MS), new Date(nowMs - 31 * DAY_MS));

  await withArtifactRun({ categoryName: 'fixture', runName: 'next', nowMs, rootDir }, async () => {
    expect(readFileSync(path.join(cache, 'build.db'), 'utf8')).toBe('active build');
  });
  expect(readFileSync(path.join(cache, 'build.db'), 'utf8')).toBe('active build');
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

it('keeps shared caches and prior evidence across production runs', async () => {
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

  expect(readFileSync(path.join(oldRun, 'payload'), 'utf8')).toBe('old');
  expect(statSync(cacheEntry).isDirectory()).toBe(true);
  expect(path.dirname(cacheEntry)).toBe(path.join(rootDir, CACHE_ROOT));
});

it('keeps the generic resource gate free of retention side effects', () => {
  const source = readFileSync(path.resolve('scripts/with-resource-gate.mjs'), 'utf8');
  expect(source).not.toContain('local-artifact-cache');
  expect(source).not.toContain('runRetention');
});
