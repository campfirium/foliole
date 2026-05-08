// @vitest-environment node

import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { inspectElectronDistFreshness } from './check-electron-dist-fresh.mjs';

async function writeTimestampedFile(filePath, content, timestampMs) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
  const timestampSeconds = timestampMs / 1000;
  await utimes(filePath, timestampSeconds, timestampSeconds);
}

describe('check-electron-dist-fresh', () => {
  it('accepts a fresh compiled electron-dist tree', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'electron-dist-fresh-'));
    const sourceRoot = path.join(tempRoot, 'electron');
    const distRoot = path.join(tempRoot, 'electron-dist');

    try {
      await writeTimestampedFile(path.join(sourceRoot, 'main.ts'), 'export {};\n', 1_000);
      await writeTimestampedFile(path.join(sourceRoot, 'preload.cjs'), 'module.exports = {};\n', 1_000);
      await writeTimestampedFile(path.join(distRoot, 'electron', 'main.js'), 'export {};\n', 2_000);

      const result = inspectElectronDistFreshness({ distRoot, repoRoot: tempRoot, sourceRoots: [sourceRoot] });

      expect(result.ok).toBe(true);
      expect(result.problems).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails when preload changes after the last electron compile', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'electron-dist-stale-'));
    const sourceRoot = path.join(tempRoot, 'electron');
    const distRoot = path.join(tempRoot, 'electron-dist');

    try {
      await writeTimestampedFile(path.join(sourceRoot, 'main.ts'), 'export {};\n', 1_000);
      await writeTimestampedFile(path.join(sourceRoot, 'preload.cjs'), 'module.exports = {};\n', 3_000);
      await writeTimestampedFile(path.join(distRoot, 'electron', 'main.js'), 'export {};\n', 2_000);

      const result = inspectElectronDistFreshness({ distRoot, repoRoot: tempRoot, sourceRoots: [sourceRoot] });

      expect(result.ok).toBe(false);
      expect(result.problems).toEqual([
        expect.objectContaining({
          newestDist: 'electron-dist/electron/main.js',
          newestSource: 'electron/preload.cjs',
          reason: 'newest-source-newer-than-dist'
        })
      ]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('ignores sources that are excluded from the electron compile', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'electron-dist-excluded-'));
    const sourceRoot = path.join(tempRoot, 'lib', 'core');
    const distRoot = path.join(tempRoot, 'electron-dist');

    try {
      await writeTimestampedFile(path.join(sourceRoot, 'database', 'androidCompanionSyncPolicySql.ts'), 'export {};\n', 3_000);
      await writeTimestampedFile(path.join(sourceRoot, 'sync', 'syncObjectPolicy.ts'), 'export {};\n', 1_000);
      await writeTimestampedFile(path.join(distRoot, 'lib', 'core', 'sync', 'syncObjectPolicy.js'), 'export {};\n', 2_000);

      const result = inspectElectronDistFreshness({ distRoot, repoRoot: tempRoot, sourceRoots: [sourceRoot] });

      expect(result.ok).toBe(true);
      expect(result.problems).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
