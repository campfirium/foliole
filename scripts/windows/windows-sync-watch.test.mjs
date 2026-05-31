// @vitest-environment node
/* global setTimeout */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { classifyBatch, diffSnapshots, snapshotWorkspace } from './windows-sync-watch.mjs';

describe('windows sync watch', () => {
  it('classifies renderer, runtime, and shell batches by highest restart scope', () => {
    expect(classifyBatch(['src/app/App.tsx'])).toBe('renderer');
    expect(classifyBatch(['electron/main.ts'])).toBe('runtime');
    expect(classifyBatch(['src/app/App.tsx', 'electron/main.ts'])).toBe('runtime');
    expect(classifyBatch(['src/app/App.tsx', 'vite.config.ts'])).toBe('shell');
    expect(classifyBatch(['scripts/windows/windows-sync.sh'])).toBe('sync-only');
  });

  it('coalesces file changes between workspace snapshots', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-sync-watch-'));
    try {
      await mkdir(path.join(root, 'src', 'app'), { recursive: true });
      await mkdir(path.join(root, 'electron'), { recursive: true });
      await writeFile(path.join(root, 'src', 'app', 'App.tsx'), 'export const app = 1;\n');

      const first = snapshotWorkspace(root);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await writeFile(path.join(root, 'src', 'app', 'App.tsx'), 'export const app = 2;\n');
      await writeFile(path.join(root, 'electron', 'main.ts'), 'export const main = 1;\n');

      const second = snapshotWorkspace(root);
      const diff = diffSnapshots(first, second);

      expect(diff.hasDeletion).toBe(false);
      expect(diff.changedFiles).toEqual(['electron/main.ts', 'src/app/App.tsx']);
      expect(classifyBatch(diff.changedFiles)).toBe('runtime');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
