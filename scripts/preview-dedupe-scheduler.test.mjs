// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { readWindowMs, runScheduledPreview } from './preview-dedupe-scheduler.mjs';

describe('preview-dedupe scheduler defaults', () => {
  it('does not delay Windows previews by default after a successful run', () => {
    expect(readWindowMs('windows', {})).toBe(0);
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
});
