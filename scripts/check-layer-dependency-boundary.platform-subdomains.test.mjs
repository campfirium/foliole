// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { inspectLayerDependencyBoundary } from './check-layer-dependency-boundary.mjs';
import { resolvePlatformSubdomain } from './platform-subdomain-boundary.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_ROOT_BASE = path.join(REPO_ROOT, '.tmp', 'tests');
const tempDirs = [];

async function createFixtureRoot() {
  await mkdir(TEMP_ROOT_BASE, { recursive: true });
  const fixtureRoot = await mkdtemp(path.join(TEMP_ROOT_BASE, 'layer-boundary-platform-'));
  tempDirs.push(fixtureRoot);
  await mkdir(path.join(fixtureRoot, 'src', 'shared', 'platform'), { recursive: true });
  return fixtureRoot;
}

async function writeFixtureFile(repoRoot, relativePath, contents) {
  await writeFile(path.join(repoRoot, relativePath), contents.trimStart(), 'utf8');
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe('check-layer-dependency-boundary platform subdomains', () => {
  it('resolves platform subdomains by path, explicit manifest, then filename rules', () => {
    expect(resolvePlatformSubdomain('src/shared/platform/runtime/customAdapter.ts')).toBe('runtime-core');
    expect(resolvePlatformSubdomain('src/shared/platform/companionSyncInstrumentationProbe.ts')).toBe(
      'companion-sync-pack-apply'
    );
    expect(resolvePlatformSubdomain('src/shared/platform/webLookupEntries.ts')).toBe('external-runtime');
    expect(resolvePlatformSubdomain('src/shared/platform/databaseMaintenanceStatusRuntimeRepository.ts')).toBe(
      'desktop-runtime-repository'
    );
    expect(resolvePlatformSubdomain('src/shared/platform/discoursePublishRepository.ts')).toBe(
      'desktop-runtime-repository'
    );
    expect(resolvePlatformSubdomain('src/shared/platform/companionSyncCursors.ts')).toBe('companion-sync-reader');
    expect(resolvePlatformSubdomain('src/shared/platform/companionPrimaryDeviceIdentity.ts')).toBe(
      'companion-runtime-plugin'
    );
    expect(resolvePlatformSubdomain('src/shared/platform/readwiseReaderImportRuntimeRepository.ts')).toBe(
      'import-runtime'
    );
    expect(resolvePlatformSubdomain('src/shared/platform/readwiseImportCleanupRuntimeRepository.ts')).toBe(
      'import-runtime'
    );
    expect(resolvePlatformSubdomain('src/shared/platform/removedSourcesRuntimeRepository.ts')).toBe(
      'import-runtime'
    );
    expect(resolvePlatformSubdomain('src/shared/platform/devReimportSelectedTopic.ts')).toBe(
      'desktop-runtime-repository'
    );
    expect(resolvePlatformSubdomain('src/shared/platform/unownedRuntimeThing.ts')).toBe(null);
  });

  it('blocks unclassified platform production files', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/shared/platform/unownedRuntimeThing.ts', `
      export const value = 1;
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual([
      { file: 'src/shared/platform/unownedRuntimeThing.ts', line: 1, kind: 'platform-subdomain-unclassified' }
    ]);
  });

  it('blocks forbidden companion sync dependency directions', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/shared/platform/companionSyncCursors.ts', `
      import { applyCompanionSyncPack } from './companionSyncPackApply';
      export const cursor = applyCompanionSyncPack;
    `);
    await writeFixtureFile(repoRoot, 'src/shared/platform/companionSyncPackApply.ts', `
      export function applyCompanionSyncPack() {}
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual([
      { file: 'src/shared/platform/companionSyncCursors.ts', line: 1, kind: 'platform-subdomain-import' }
    ]);
  });

  it('allows facade and writer queue dependency directions', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/shared/platform/importBridge.ts', `
      export { loadRuntimeImportOverview } from './importOverviewRuntimeRepository';
    `);
    await writeFixtureFile(repoRoot, 'src/shared/platform/importOverviewRuntimeRepository.ts', `
      export function loadRuntimeImportOverview() {}
    `);
    await writeFixtureFile(repoRoot, 'src/shared/platform/companionSyncCursors.ts', `
      import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
      export const queue = runCompanionSyncWriterTask;
    `);
    await writeFixtureFile(repoRoot, 'src/shared/platform/companionSyncWriterQueue.ts', `
      export function runCompanionSyncWriterTask() {}
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.ok).toBe(true);
  });

  it('allows import runtime to refresh external runtime state after imports', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/shared/platform/readwiseReaderImportRuntimeRepository.ts', `
      import { refreshRuntimeExternalSearchFolders } from './externalSearchRuntimeRepository';
      export const refresh = refreshRuntimeExternalSearchFolders;
    `);
    await writeFixtureFile(repoRoot, 'src/shared/platform/externalSearchRuntimeRepository.ts', `
      export function refreshRuntimeExternalSearchFolders() {}
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.ok).toBe(true);
  });
});
