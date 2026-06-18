// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { inspectStructureBoundary, runCli } from './check-structure-boundary.mjs';

const tempDirs = [];

async function createFixtureRoot({ dirs = [], files = [] }) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'structure-boundary-'));
  tempDirs.push(fixtureRoot);
  await mkdir(path.join(fixtureRoot, 'src'), { recursive: true });
  await Promise.all(dirs.map((dir) => mkdir(path.join(fixtureRoot, 'src', dir), { recursive: true })));
  await Promise.all(files.map((file) => writeFile(path.join(fixtureRoot, 'src', file), '', 'utf8')));
  return fixtureRoot;
}

function createWritableBuffer() {
  const chunks = [];
  return {
    chunks,
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    }
  };
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe('check-structure-boundary', () => {
  it('allows every current top-level src directory and top-level files', async () => {
    const repoRoot = await createFixtureRoot({
      dirs: ['app', 'companion', 'demo', 'features', 'shared', 'store', 'test'],
      files: ['main.tsx', 'startupBootstrap.ts', 'global.d.ts']
    });

    const result = inspectStructureBoundary({ repoRoot });

    expect(result.ok).toBe(true);
    expect(result.scannedDirectories).toEqual([
      'src/app',
      'src/companion',
      'src/demo',
      'src/features',
      'src/shared',
      'src/store',
      'src/test'
    ]);
  });

  it('allows target source surfaces under src/surfaces', async () => {
    const repoRoot = await createFixtureRoot({ dirs: ['surfaces/desktop', 'surfaces/demo'] });

    const result = inspectStructureBoundary({ repoRoot });

    expect(result.ok).toBe(true);
    expect(result.scannedDirectories).toEqual(['src/surfaces']);
  });

  it('blocks fallback directories under src', async () => {
    const repoRoot = await createFixtureRoot({ dirs: ['app', 'lib', 'utils', 'common'] });

    const result = inspectStructureBoundary({ repoRoot });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({ kind: 'fallback-directory', path: 'src/common' }),
      expect.objectContaining({ kind: 'fallback-directory', path: 'src/lib' }),
      expect.objectContaining({ kind: 'fallback-directory', path: 'src/utils' })
    ]);
  });

  it('blocks unauthorized top-level source surface directories', async () => {
    const repoRoot = await createFixtureRoot({ dirs: ['app', 'mobile'] });

    const result = inspectStructureBoundary({ repoRoot });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({ kind: 'unauthorized-src-directory', path: 'src/mobile' })
    ]);
  });

  it('prints actionable CLI output', async () => {
    const repoRoot = await createFixtureRoot({ dirs: ['utils'] });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const cliResult = runCli({ repoRoot, stdout, stderr });

    expect(cliResult.exitCode).toBe(1);
    expect(stdout.chunks.join('')).toBe('');
    expect(stderr.chunks.join('')).toContain('fallback-directory=src/utils');
    expect(stderr.chunks.join('')).toContain('.lab/specs/architecture/transition-directory-boundary.md');
  });
});
