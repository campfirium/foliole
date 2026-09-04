// @vitest-environment node

import { Buffer } from 'node:buffer';
import {
  existsSync,
  lutimesSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ARTIFACT_ROOT,
  CACHE_ROOT,
  refreshCacheEntry,
  runRetention
} from './local-artifact-cache-retention.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const nowMs = Date.UTC(2026, 7, 5);

function setTime(path, ageDays) {
  const time = new Date(nowMs - ageDays * DAY_MS);
  utimesSync(path, time, time);
}

function makeEntry(root, relativeRoot, name, bytes, ageDays) {
  const entry = join(root, relativeRoot, name);
  mkdirSync(entry, { recursive: true });
  writeFileSync(join(entry, 'payload'), Buffer.alloc(bytes));
  setTime(entry, ageDays);
  return entry;
}

function withFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'foliole-retention-'));
  try {
    return run(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

describe('local artifact and cache retention', () => {
  it('applies the exact one-day and thirty-day expiration boundaries', () => withFixture((root) => {
    const artifact = makeEntry(root, `${ARTIFACT_ROOT}/category`, 'one-day', 2, 1);
    const cache = makeEntry(root, CACHE_ROOT, 'thirty-days', 2, 30);

    const result = runRetention({ apply: true, nowMs, rootDir: root });

    expect(result.entries.map((entry) => entry.path).sort()).toEqual([artifact, cache].sort());
    expect(existsSync(artifact)).toBe(false);
    expect(existsSync(cache)).toBe(false);
  }));

  it('ages nested artifact runs independently without following symlinks', () => withFixture((root) => {
    const oldBatch = makeEntry(root, `${ARTIFACT_ROOT}/category`, 'old-run', 2, 2);
    const recentBatch = makeEntry(root, `${ARTIFACT_ROOT}/category`, 'recent-run', 2, 0.5);
    const outside = makeEntry(root, 'private', 'only-copy', 2, 2);
    const link = join(root, ARTIFACT_ROOT, 'category', 'linked-run');
    symlinkSync(outside, link);
    const oldLinkTime = new Date(nowMs - 2 * DAY_MS);
    lutimesSync(link, oldLinkTime, oldLinkTime);
    setTime(join(root, ARTIFACT_ROOT, 'category'), 0);

    const result = runRetention({ apply: true, nowMs, rootDir: root, scope: 'artifact' });

    expect(result.ok).toBe(true);
    expect(result.entries.map((entry) => entry.runName).sort()).toEqual(['linked-run', 'old-run']);
    expect(existsSync(oldBatch)).toBe(false);
    expect(existsSync(recentBatch)).toBe(true);
    expect(readFileSync(join(outside, 'payload'))).toHaveLength(2);
    expect(existsSync(join(root, ARTIFACT_ROOT))).toBe(true);
  }));

  it('refreshes cache use and evicts stale then least-recent entries as whole units', () => withFixture((root) => {
    const stale = makeEntry(root, CACHE_ROOT, 'stale', 5, 31);
    const oldest = makeEntry(root, CACHE_ROOT, 'oldest', 6, 20);
    const refreshed = makeEntry(root, CACHE_ROOT, 'refreshed', 6, 10);
    const newest = makeEntry(root, CACHE_ROOT, 'newest', 6, 1);

    refreshCacheEntry({ entryName: 'refreshed', nowMs, rootDir: root });
    const result = runRetention({ apply: true, maxCacheBytes: 12, nowMs, rootDir: root, scope: 'cache' });

    expect(result.entries.map(({ name, reason }) => [name, reason])).toEqual([
      ['stale', 'expired'],
      ['oldest', 'capacity']
    ]);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(oldest)).toBe(false);
    expect(existsSync(refreshed)).toBe(true);
    expect(existsSync(newest)).toBe(true);
    expect(existsSync(join(root, CACHE_ROOT))).toBe(true);
  }));

  it('treats missing roots as empty and rejects cache entry path escapes', () => withFixture((root) => {
    expect(runRetention({ rootDir: root })).toMatchObject({ entries: [], ok: true });
    expect(() => refreshCacheEntry({ entryName: '../outside', rootDir: root })).toThrow('first-level');
  }));

  it('reports partial deletion failures and remains safely reentrant', () => withFixture((root) => {
    const first = makeEntry(root, `${ARTIFACT_ROOT}/fixture`, 'first', 2, 2);
    const second = makeEntry(root, `${ARTIFACT_ROOT}/fixture`, 'second', 2, 2);
    const failed = runRetention({
      apply: true,
      nowMs,
      removeEntry: (path) => {
        if (path === first) {
          throw new Error('permission denied');
        }
        rmSync(path, { force: true, recursive: true });
      },
      rootDir: root,
      scope: 'artifact'
    });

    expect(failed).toMatchObject({ deletedCount: 1, ok: false });
    expect(failed.failures).toEqual([{ message: 'permission denied', path: first }]);
    expect(existsSync(first)).toBe(true);
    expect(existsSync(second)).toBe(false);

    const retried = runRetention({ apply: true, nowMs, rootDir: root, scope: 'artifact' });
    expect(retried).toMatchObject({ deletedCount: 1, ok: true });
    expect(existsSync(first)).toBe(false);
  }));
});
