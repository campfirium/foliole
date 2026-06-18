// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { runScheduledPreview } from './preview-dedupe-scheduler.mjs';

describe('preview-dedupe scheduler failure handling', () => {
  it('returns a failed Windows preview request by default', async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'preview-scheduler-'));
    try {
      let runs = 0;
      const waitAnnouncer = { shouldAnnounce: () => false };
      const result = await runScheduledPreview({
        runtimeDir,
        runPreview: async () => {
          runs += 1;
          return { exitCode: 1, hash: 'hash-failed', previewed: true };
        },
        target: 'windows',
        settleMs: 0,
        totalTimeoutMs: 500,
        waitAnnouncer,
        windowMs: 0
      });

      expect(result).toBe(1);
      expect(runs).toBe(1);
    } finally {
      await rm(runtimeDir, { force: true, recursive: true });
    }
  });

  it('keeps a failed Windows preview request waiting when configured until a later run succeeds', async () => {
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
        waitOnFailure: true,
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
        waitOnFailure: true,
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
});
