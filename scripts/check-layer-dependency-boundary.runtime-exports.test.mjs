// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { inspectLayerDependencyBoundary } from './check-layer-dependency-boundary.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_ROOT_BASE = path.join(REPO_ROOT, '.tmp', 'tests');
const tempDirs = [];

async function createFixtureRoot() {
  await mkdir(TEMP_ROOT_BASE, { recursive: true });
  const fixtureRoot = await mkdtemp(path.join(TEMP_ROOT_BASE, 'runtime-export-boundary-'));
  tempDirs.push(fixtureRoot);
  await mkdir(path.join(fixtureRoot, 'src', 'features', 'settings'), { recursive: true });
  return fixtureRoot;
}

async function writeFixtureFile(repoRoot, relativePath, contents) {
  await writeFile(path.join(repoRoot, relativePath), contents.trimStart(), 'utf8');
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe('check-layer-dependency-boundary runtime boundary re-exports', () => {
  it('blocks upper production code from re-exporting runtime boundaries', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/features/settings/runtimeExports.ts', `
      export { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
      export { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
      export { getElectronAPI } from '../../shared/platform/electronApi';
      export { loadRuntimeImportOverview } from '../../shared/platform/importBridge';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual([
      { file: 'src/features/settings/runtimeExports.ts', line: 1, kind: 'runtime-command-import' },
      { file: 'src/features/settings/runtimeExports.ts', line: 2, kind: 'runtime-command-import' },
      { file: 'src/features/settings/runtimeExports.ts', line: 3, kind: 'runtime-host-bridge-import' },
      { file: 'src/features/settings/runtimeExports.ts', line: 4, kind: 'runtime-bridge-import' }
    ]);
  });
});
