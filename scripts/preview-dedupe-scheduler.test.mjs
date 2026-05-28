// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { runScheduledPreview } from './preview-dedupe-scheduler.mjs';
import { readMaxSettleMs, readSettleMs, readTotalTimeoutMs, readWindowMs } from './preview-dedupe-time-budget.mjs';

describe('preview-dedupe scheduler defaults', () => {
  it('keeps the default Windows validation window after a successful run', () => {
    expect(readWindowMs('windows', {})).toBe(3 * 60_000);
  });

  it('keeps a default Windows settle window before the first real preview', () => {
    expect(readSettleMs('windows', {})).toBe(3 * 60_000);
  });

  it('caps the default Windows settle window extension', () => {
    expect(readMaxSettleMs('windows', {})).toBe(6 * 60_000);
  });

  it('budgets the default Windows total timeout to include validation wait and preview execution', () => {
    expect(readTotalTimeoutMs('windows', 3 * 60_000, {})).toBe(13 * 60_000);
  });

  it('ignores a stored validation window when the window is disabled', async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'preview-scheduler-'));
    try {
      await mkdir(runtimeDir, { recursive: true });
      await writeFile(
        path.join(runtimeDir, 'windows-preview.state.json'),
        JSON.stringify({ acceptingUntil: Date.now() + 60_000, runs: {} }),
        'utf8'
      );

      let runs = 0;
      const result = await runScheduledPreview({
        runtimeDir,
        runPreview: async () => {
          runs += 1;
          return { exitCode: 0, hash: 'hash-1', previewed: true };
        },
        target: 'windows',
        settleMs: 0,
        windowMs: 0
      });

      expect(result).toBe(0);
      expect(runs).toBe(1);
    } finally {
      await rm(runtimeDir, { force: true, recursive: true });
    }
  });

  it('keeps a failed Windows preview request waiting until a later run succeeds', async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'preview-scheduler-'));
    try {
      let runs = 0;
      const waitAnnouncer = { shouldAnnounce: () => false };
      const first = runScheduledPreview({
        runtimeDir,
        runPreview: async () => {
          runs += 1;
          return { exitCode: 1, hash: 'hash-failed', previewed: true };
        },
        target: 'windows',
        settleMs: 0,
        totalTimeoutMs: 2_000,
        waitAnnouncer,
        windowMs: 0
      });

      await delay(260);
      const second = await runScheduledPreview({
        runtimeDir,
        runPreview: async () => {
          runs += 1;
          return { exitCode: 0, hash: 'hash-ok', previewed: true };
        },
        target: 'windows',
        settleMs: 0,
        totalTimeoutMs: 2_000,
        waitAnnouncer,
        windowMs: 0
      });
      const firstResult = await first;
      const state = JSON.parse(await readFile(path.join(runtimeDir, 'windows-preview.state.json'), 'utf8'));

      expect(second).toBe(0);
      expect(firstResult).toBe(0);
      expect(runs).toBe(2);
      expect(Object.values(state.runs).filter((run) => run.status === 'completed')).toHaveLength(2);
    } finally {
      await rm(runtimeDir, { force: true, recursive: true });
    }
  });

  it('fails and completes the request when the validation wait exceeds the internal total timeout', async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'preview-scheduler-'));
    try {
      await mkdir(runtimeDir, { recursive: true });
      await writeFile(
        path.join(runtimeDir, 'windows-preview.state.json'),
        JSON.stringify({ acceptingUntil: Date.now() + 60_000, runs: {} }),
        'utf8'
      );

      let runs = 0;
      const result = await runScheduledPreview({
        runtimeDir,
        runPreview: async () => {
          runs += 1;
          return { exitCode: 0, hash: 'hash-1', previewed: true };
        },
        target: 'windows',
        settleMs: 0,
        totalTimeoutMs: 20,
        windowMs: 60_000
      });
      const state = JSON.parse(await readFile(path.join(runtimeDir, 'windows-preview.state.json'), 'utf8'));
      const completedRuns = Object.values(state.runs).filter((run) => run.status === 'completed');

      expect(result).toBe(1);
      expect(runs).toBe(0);
      expect(state.activeRunId).toBeNull();
      expect(completedRuns).toHaveLength(1);
      expect(completedRuns[0].exitCode).toBe(1);
    } finally {
      await rm(runtimeDir, { force: true, recursive: true });
    }
  });

  it('extends first-preview batching when another request arrives during the settle window', async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'preview-scheduler-'));
    try {
      let runs = 0;
      const waitAnnouncer = { shouldAnnounce: () => false };
      const first = runScheduledPreview({
        runtimeDir,
        runPreview: async () => {
          runs += 1;
          return { exitCode: 0, hash: 'hash-ok', previewed: true };
        },
        settleMs: 140,
        maxSettleMs: 260,
        target: 'windows',
        waitAnnouncer,
        windowMs: 0
      });

      await delay(40);
      const second = runScheduledPreview({
        runtimeDir,
        runPreview: async () => {
          runs += 1;
          return { exitCode: 0, hash: 'hash-ok', previewed: true };
        },
        settleMs: 140,
        maxSettleMs: 260,
        target: 'windows',
        waitAnnouncer,
        windowMs: 0
      });
      const earlyResult = await Promise.race([first.then(() => 'settled'), delay(180).then(() => 'waiting')]);
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(earlyResult).toBe('waiting');
      expect(firstResult).toBe(0);
      expect(secondResult).toBe(0);
      expect(runs).toBe(1);
    } finally {
      await rm(runtimeDir, { force: true, recursive: true });
    }
  });

  it('caps repeated settle-window extensions from the first request time', async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'preview-scheduler-'));
    try {
      let runs = 0;
      const waitAnnouncer = { shouldAnnounce: () => false };
      const options = { maxSettleMs: 220, runtimeDir, settleMs: 120, target: 'windows', waitAnnouncer, windowMs: 0 };
      const first = runScheduledPreview({
        ...options,
        runPreview: async () => {
          runs += 1;
          return { exitCode: 0, hash: 'hash-ok', previewed: true };
        }
      });
      await delay(80);
      const second = runScheduledPreview({
        ...options,
        runPreview: async () => {
          runs += 1;
          return { exitCode: 0, hash: 'hash-ok', previewed: true };
        }
      });
      await delay(80);
      const third = runScheduledPreview({
        ...options,
        runPreview: async () => {
          runs += 1;
          return { exitCode: 0, hash: 'hash-ok', previewed: true };
        }
      });
      const earlyResult = await Promise.race([first.then(() => 'settled'), delay(40).then(() => 'waiting')]);
      const [firstResult, secondResult, thirdResult] = await Promise.all([first, second, third]);

      expect(earlyResult).toBe('waiting');
      expect(firstResult).toBe(0);
      expect(secondResult).toBe(0);
      expect(thirdResult).toBe(0);
      expect(runs).toBe(1);
    } finally {
      await rm(runtimeDir, { force: true, recursive: true });
    }
  });
});
