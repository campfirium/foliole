// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runScheduledPreview } from './preview-dedupe-scheduler.mjs';

describe('preview-dedupe scheduler timeout cleanup', () => {
  it('clears a timed-out settle batch before accepting a later request', async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'preview-scheduler-timeout-'));
    try {
      const waitAnnouncer = { shouldAnnounce: () => false };
      const timedOut = await runScheduledPreview({
        runtimeDir,
        runPreview: async () => ({ exitCode: 0, hash: 'late', previewed: true }),
        settleMs: 10_000,
        target: 'windows',
        totalTimeoutMs: 20,
        waitAnnouncer,
        windowMs: 0
      });
      let runs = 0;
      const result = await runScheduledPreview({
        runtimeDir,
        runPreview: async () => {
          runs += 1;
          return { exitCode: 0, hash: 'hash-ok', previewed: true };
        },
        settleMs: 0,
        target: 'windows',
        waitAnnouncer,
        windowMs: 0
      });
      const state = JSON.parse(await readFile(path.join(runtimeDir, 'windows-preview.state.json'), 'utf8'));

      expect(timedOut).toBe(1);
      expect(result).toBe(0);
      expect(runs).toBe(1);
      expect(state.nextRunId).toBeNull();
    } finally {
      await rm(runtimeDir, { force: true, recursive: true });
    }
  });
});
