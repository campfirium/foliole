// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { planElectronDistIncrementalSync } from './electron-dist-incremental-sync.mjs';

describe('electron-dist-incremental-sync', () => {
  it('plans compiled output sync for runtime TypeScript changes', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'electron-dist-sync-'));
    try {
      await mkdir(path.join(tempRoot, 'electron-dist', 'electron'), { recursive: true });
      await writeFile(path.join(tempRoot, 'electron-dist', 'electron', 'main.js'), 'export {};\n');
      const plan = planElectronDistIncrementalSync({
        changedFiles: 'electron/main.ts',
        mirrorDir: tempRoot,
        repoRoot: tempRoot
      });

      expect(plan).toEqual({
        files: ['electron-dist/electron/main.js'],
        reason: 'runtime-outputs',
        status: 'sync'
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('falls back for unsupported runtime paths', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'electron-dist-sync-'));
    try {
      const plan = planElectronDistIncrementalSync({
        changedFiles: 'electron/preload.cjs',
        mirrorDir: tempRoot,
        repoRoot: tempRoot
      });

      expect(plan.status).toBe('fallback');
      expect(plan.reason).toBe('unsupported-runtime-path:electron/preload.cjs');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('ignores test-only runtime sources in mixed incremental plans', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'electron-dist-sync-'));
    try {
      await mkdir(path.join(tempRoot, 'electron-dist', 'electron'), { recursive: true });
      await writeFile(path.join(tempRoot, 'electron-dist', 'electron', 'main.js'), 'export {};\n');
      await writeFile(path.join(tempRoot, 'electron-dist', 'electron', 'main.test.js'), 'export {};\n');
      const plan = planElectronDistIncrementalSync({
        changedFiles: ['electron/main.ts', 'electron/main.test.ts'].join('\n'),
        mirrorDir: tempRoot,
        repoRoot: tempRoot
      });

      expect(plan).toEqual({
        files: ['electron-dist/electron/main.js'],
        reason: 'runtime-outputs',
        status: 'sync'
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
