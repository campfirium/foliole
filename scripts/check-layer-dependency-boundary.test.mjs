// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { inspectLayerDependencyBoundary } from './check-layer-dependency-boundary.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_ROOT_BASE = path.join(REPO_ROOT, '.tmp-tests');
const tempDirs = [];

async function createFixtureRoot() {
  await mkdir(TEMP_ROOT_BASE, { recursive: true });
  const fixtureRoot = await mkdtemp(path.join(TEMP_ROOT_BASE, 'layer-boundary-'));
  tempDirs.push(fixtureRoot);
  await mkdir(path.join(fixtureRoot, 'src', 'store'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'src', 'features', 'review'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'src', 'features', 'settings'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'src', 'app', 'hooks'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'src', 'companion'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'src', 'shared', 'platform'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'src', 'shared', 'diagnostics'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'lib', 'core', 'nodes'), { recursive: true });
  return fixtureRoot;
}

async function writeFixtureFile(repoRoot, relativePath, contents) {
  await writeFile(path.join(repoRoot, relativePath), contents.trimStart(), 'utf8');
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe('check-layer-dependency-boundary runtime command imports', () => {
  it('blocks store and review production code from importing runtime command details', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/store/badStore.ts', `
      import {
        getRuntimeInvoke
      } from '../shared/platform/bridge';
    `);
    await writeFixtureFile(repoRoot, 'src/features/review/badReview.ts', `
      import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        { file: 'src/store/badStore.ts', line: 1, kind: 'runtime-command-import' },
        { file: 'src/features/review/badReview.ts', line: 1, kind: 'runtime-command-import' }
      ])
    );
  });

  it('blocks feature production code from importing runtime command details', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/features/settings/settingsRuntime.ts', `
      import { getRuntimeInvoke } from '../../shared/platform/bridge';
      import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
    `);
    await mkdir(path.join(repoRoot, 'src', 'features', 'library'), { recursive: true });
    await writeFixtureFile(repoRoot, 'src/features/library/libraryRuntime.ts', `
      import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        { file: 'src/features/settings/settingsRuntime.ts', line: 1, kind: 'runtime-command-import' },
        { file: 'src/features/settings/settingsRuntime.ts', line: 2, kind: 'runtime-command-import' },
        { file: 'src/features/library/libraryRuntime.ts', line: 1, kind: 'runtime-command-import' }
      ])
    );
  });

  it('keeps shared platform adapters out of the current runtime command rule', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/shared/platform/workspaceRuntimeRepository.ts', `
      import { getRuntimeInvoke } from './bridge';
      import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.ok).toBe(true);
  });

  it('blocks active shared platform modules from importing compatibility bridge modules', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/shared/platform/workspaceRuntimeRepository.ts', `
      import { loadRuntimeImportOverview } from './importBridge';
      import { toRuntimeTextImportResult } from './importBridgePayloads';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        { file: 'src/shared/platform/workspaceRuntimeRepository.ts', line: 1, kind: 'platform-compat-import' },
        { file: 'src/shared/platform/workspaceRuntimeRepository.ts', line: 2, kind: 'platform-compat-import' }
      ])
    );
  });

  it('allows shared platform compatibility modules to re-export runtime modules', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/shared/platform/importBridge.ts', `
      export { loadRuntimeImportOverview } from './importOverviewRuntimeRepository';
    `);
    await writeFixtureFile(repoRoot, 'src/shared/platform/importBridgePayloads.ts', `
      export { toRuntimeTextImportResult } from './importRuntimePayloads';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.ok).toBe(true);
  });

  it('blocks upper production code from importing bridge-named runtime modules', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/app/hooks/usePdfImports.ts', `
      import { loadRuntimePdfImportsInventory } from '../../shared/platform/pdfImportsBridge';
    `);
    await writeFixtureFile(repoRoot, 'src/features/review/reviewRuntime.ts', `
      import type { RuntimeReviewGradePayload } from '../../shared/platform/reviewBridge';
    `);
    await writeFixtureFile(repoRoot, 'src/companion/companionRuntime.ts', `
      import { isNativeAndroidCompanionRuntime } from '../shared/platform/companionWorkspaceSyncBridge';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        { file: 'src/app/hooks/usePdfImports.ts', line: 1, kind: 'runtime-bridge-import' },
        { file: 'src/features/review/reviewRuntime.ts', line: 1, kind: 'runtime-bridge-import' },
        { file: 'src/companion/companionRuntime.ts', line: 1, kind: 'runtime-bridge-import' }
      ])
    );
  });

  it('blocks shared diagnostics helpers from importing runtime command details', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/shared/diagnostics/debugRuntime.ts', `
      import { getRuntimeInvoke } from '../platform/bridge';
      import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
      import { getElectronAPI } from '../platform/electronApi';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        { file: 'src/shared/diagnostics/debugRuntime.ts', line: 1, kind: 'runtime-command-import' },
        { file: 'src/shared/diagnostics/debugRuntime.ts', line: 2, kind: 'runtime-command-import' },
        { file: 'src/shared/diagnostics/debugRuntime.ts', line: 3, kind: 'runtime-host-bridge-import' }
      ])
    );
  });

  it('blocks app production code from importing runtime command details', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/app/hooks/useAppRuntime.ts', `
      import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
    `);
    await writeFixtureFile(repoRoot, 'src/app/SearchPalette.tsx', `
      import { getRuntimeInvoke } from '../shared/platform/bridge';
    `);
    await writeFixtureFile(repoRoot, 'src/features/settings/settingsKeyboard.ts', `
      import { getElectronAPI } from '../../shared/platform/electronApi';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        { file: 'src/app/hooks/useAppRuntime.ts', line: 1, kind: 'runtime-command-import' },
        { file: 'src/app/SearchPalette.tsx', line: 1, kind: 'runtime-command-import' },
        { file: 'src/features/settings/settingsKeyboard.ts', line: 1, kind: 'runtime-host-bridge-import' }
      ])
    );
  });

  it('blocks companion production code from importing runtime command details', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/companion/companionRuntime.ts', `
      import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual([
      { file: 'src/companion/companionRuntime.ts', line: 1, kind: 'runtime-command-import' }
    ]);
  });

  it('blocks core modules from importing native platform contracts', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'lib/core/nodes/badCore.ts', `
      import { NATIVE_COMMANDS } from '../../platform/nativeCommands.js';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual([
      { file: 'lib/core/nodes/badCore.ts', line: 1, kind: 'core-platform-import' }
    ]);
  });
});
