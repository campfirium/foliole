// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { inspectLayerDependencyBoundary } from './check-layer-dependency-boundary.mjs';
import { resolveTopologyUnit } from './layer-topology-rules.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_ROOT_BASE = path.join(REPO_ROOT, '.tmp', 'tests');
const tempDirs = [];

async function createFixtureRoot() {
  await mkdir(TEMP_ROOT_BASE, { recursive: true });
  const fixtureRoot = await mkdtemp(path.join(TEMP_ROOT_BASE, 'layer-topology-'));
  tempDirs.push(fixtureRoot);
  await mkdir(path.join(fixtureRoot, 'electron'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'src', 'app'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'src', 'companion'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'src', 'demo'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'src', 'features'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'src', 'shared', 'platform'), { recursive: true });
  return fixtureRoot;
}

async function writeFixtureFile(repoRoot, relativePath, contents) {
  await writeFile(path.join(repoRoot, relativePath), contents.trimStart(), 'utf8');
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe('layer topology rules', () => {
  it('classifies desktop renderer, companion renderer, shared renderer, runtime, and host units', () => {
    expect(resolveTopologyUnit('src/app/App.tsx')).toMatchObject({ id: 'desktop-renderer', host: 'desktop' });
    expect(resolveTopologyUnit('src/companion/CompanionApp.tsx')).toMatchObject({
      host: 'companion',
      id: 'companion-renderer'
    });
    expect(resolveTopologyUnit('src/demo/main.tsx')).toMatchObject({
      id: 'demo-renderer',
      host: 'demo'
    });
    expect(resolveTopologyUnit('src/features/review/reviewModel.ts')).toMatchObject({ id: 'renderer-business' });
    expect(resolveTopologyUnit('src/shared/platform/runtimeAppPaths.ts')).toMatchObject({ id: 'runtime-adapter' });
    expect(resolveTopologyUnit('electron/main.ts')).toMatchObject({ id: 'electron-host', host: 'electron' });
  });

  it('blocks renderer layers from importing host adapters through relative or rooted paths', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/app/badDesktop.ts', `
      import { boot } from '../../electron/main';
    `);
    await writeFixtureFile(repoRoot, 'src/companion/badMobile.ts', `
      import { boot } from '../../electron/main';
    `);
    await writeFixtureFile(repoRoot, 'src/features/badFeature.ts', `
      import { boot } from 'electron/main';
    `);
    await writeFixtureFile(repoRoot, 'src/demo/badDemo.ts', `
      import { boot } from '../../electron/main';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        { file: 'src/app/badDesktop.ts', line: 1, kind: 'host-adapter-import' },
        { file: 'src/companion/badMobile.ts', line: 1, kind: 'host-adapter-import' },
        { file: 'src/features/badFeature.ts', line: 1, kind: 'host-adapter-import' },
        { file: 'src/demo/badDemo.ts', line: 1, kind: 'host-adapter-import' }
      ])
    );
  });

  it('allows Demo to reuse the desktop renderer while blocking runtime bridges', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/demo/goodShell.ts', `
      import { App } from '../app/App';
    `);
    await writeFixtureFile(repoRoot, 'src/demo/badRuntime.ts', `
      import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
      import { loadCompanionAppData } from '../shared/platform/companionAppDataBridge';
    `);
    await writeFixtureFile(repoRoot, 'src/demo/badHostObject.ts', `
      const api = window.electronAPI;
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        { file: 'src/demo/badRuntime.ts', line: 1, kind: 'runtime-command-import' },
        { file: 'src/demo/badRuntime.ts', line: 2, kind: 'runtime-bridge-import' },
        { file: 'src/demo/badHostObject.ts', line: 1, kind: 'host-object-access' }
      ])
    );
    expect(result.violations).not.toContainEqual({ file: 'src/demo/goodShell.ts', line: 1, kind: 'renderer-shell-import' });
  });

  it('blocks Electron host adapters from importing renderer layers', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'electron/badHost.ts', `
      import { App } from '../src/app/App';
      import { renderCompanion } from '@/companion/CompanionApp';
      import { DemoApp } from '../src/demo/main';
      import { useWorkspaceStore } from '../src/store/workspaceStore';
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual([
      { file: 'electron/badHost.ts', line: 1, kind: 'host-isolation-import' },
      { file: 'electron/badHost.ts', line: 2, kind: 'host-isolation-import' },
      { file: 'electron/badHost.ts', line: 3, kind: 'host-isolation-import' },
      { file: 'electron/badHost.ts', line: 4, kind: 'host-isolation-import' }
    ]);
  });

  it('allows renderer layers to consume shared runtime facades and shared core', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/app/goodDesktop.ts', `
      import { loadRuntimeLibraryPathSettings } from '../shared/platform/libraryPathSettingsRepository';
      import { createNodeTree } from '../../lib/core/nodes/tree';
    `);
    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.ok).toBe(true);
  });
});
