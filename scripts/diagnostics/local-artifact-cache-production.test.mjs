// @vitest-environment node

import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { ARTIFACT_ROOT, CACHE_ROOT } from './local-artifact-cache-retention.mjs';
import {
  prepareCacheEntry,
  withArtifactBatch
} from './local-artifact-cache-production.mjs';

const fixtureRoots = [];
const DAY_MS = 24 * 60 * 60 * 1000;

function makeFixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'foliole-production-retention-'));
  fixtureRoots.push(rootDir);
  return rootDir;
}

function makeOldArtifact(rootDir, name, nowMs) {
  const entry = path.join(rootDir, ARTIFACT_ROOT, name);
  mkdirSync(entry, { recursive: true });
  writeFileSync(path.join(entry, 'payload'), 'old');
  const oldTime = new Date(nowMs - 2 * DAY_MS);
  utimesSync(entry, oldTime, oldTime);
  return entry;
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

it('refreshes the active cache entry before maintaining other local storage', () => {
  const rootDir = makeFixture();
  const nowMs = Date.UTC(2026, 7, 5);
  makeOldArtifact(rootDir, 'expired', nowMs);
  const existingCache = path.join(rootDir, CACHE_ROOT, 'ios-runtime-contract');
  mkdirSync(existingCache, { recursive: true });
  const staleTime = new Date(nowMs - 31 * DAY_MS);
  utimesSync(existingCache, staleTime, staleTime);

  const entryPath = prepareCacheEntry({ entryName: 'ios-runtime-contract', nowMs, rootDir });

  expect(entryPath).toBe(path.join(rootDir, CACHE_ROOT, 'ios-runtime-contract'));
  expect(statSync(entryPath).mtimeMs).toBe(nowMs);
  expect(() => statSync(path.join(rootDir, ARTIFACT_ROOT, 'expired'))).toThrow();
});

it('blocks production when maintenance cannot delete a candidate', async () => {
  const rootDir = makeFixture();
  const nowMs = Date.UTC(2026, 7, 5);
  makeOldArtifact(rootDir, 'blocked', nowMs);
  const produce = vi.fn();

  await expect(withArtifactBatch({
    entryName: 'next-batch', nowMs,
    removeEntry: () => { throw new Error('permission denied'); }, rootDir
  }, produce)).rejects.toThrow('maintenance failed');
  expect(produce).not.toHaveBeenCalled();
});

it('refreshes an artifact batch after successful or failed production', async () => {
  const rootDir = makeFixture();
  const entryName = 'ios-bridge-acceptance';
  const entryPath = path.join(rootDir, ARTIFACT_ROOT, entryName);

  await expect(withArtifactBatch({ entryName, rootDir }, async () => {
    mkdirSync(entryPath, { recursive: true });
    throw new Error('acceptance failed');
  })).rejects.toThrow('acceptance failed');

  expect(Date.now() - statSync(entryPath).mtimeMs).toBeLessThan(5_000);
});

it('keeps the generic resource gate free of retention side effects', () => {
  const source = readFileSync(path.resolve('scripts/with-resource-gate.mjs'), 'utf8');
  expect(source).not.toContain('local-artifact-cache');
  expect(source).not.toContain('runRetention');
});
