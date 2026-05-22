// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { runScheduledPreview } from './preview-dedupe-scheduler.mjs';
import { readTotalTimeoutMs, readWindowMs } from './preview-dedupe-time-budget.mjs';

describe('preview-dedupe scheduler defaults', () => {
  it('keeps the default Windows validation window after a successful run', () => {
    expect(readWindowMs('windows', {})).toBe(3 * 60_000);
  });

  it('budgets the default Windows total timeout to include validation wait and preview execution', () => {
    expect(readTotalTimeoutMs('windows', 3 * 60_000, {})).toBe(7 * 60_000);
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
      const result = await Promise.race([
        runScheduledPreview({
          runtimeDir,
          runPreview: async () => {
            runs += 1;
            return { exitCode: 0, hash: 'hash-1', previewed: true };
          },
          target: 'windows',
          windowMs: 0
        }),
        delay(120).then(() => 'waiting')
      ]);

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
});
