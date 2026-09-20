// @vitest-environment node

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import {
  prepareFriControlPlaneCache, prepareIosAcceptanceCache, prepareIosRuntimeContractCache,
  resolveIosCacheRepoRoot
} from './ios-local-storage.mjs';
import { runRetention } from '../diagnostics/local-artifact-cache-retention.mjs';
import { createSimulatorAcceptanceBuildArgs } from './ios-simulator-acceptance-runner.mjs';

afterEach(() => vi.unstubAllEnvs());

it('routes reusable Swift caches and scratch builds into one cache entry', () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'foliole-ios-storage-'));
  try {
    expect(prepareIosRuntimeContractCache(repoRoot)).toEqual({
      clangModuleCache: path.join(repoRoot, '.cache/ios-runtime-contract/clang'),
      scratchPath: path.join(repoRoot, '.cache/ios-runtime-contract/scratch'),
      swiftpmModuleCache: path.join(repoRoot, '.cache/ios-runtime-contract/swiftpm')
    });
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

it('rejects a relative explicit owner rather than caching inside a frozen source', () => {
  expect(() => resolveIosCacheRepoRoot('/source', { FOLIOLE_IOS_CACHE_REPO_ROOT: '' }))
    .toThrow('absolute path');
  expect(() => resolveIosCacheRepoRoot('/source', { FOLIOLE_IOS_CACHE_REPO_ROOT: '../cache' }))
    .toThrow('absolute path');
});

it('reuses caches across source deletion and artifact retention without changing source selection', () => {
  const owner = mkdtempSync(path.join(tmpdir(), 'foliole-ios-persistent-'));
  vi.stubEnv('FOLIOLE_IOS_CACHE_REPO_ROOT', owner);
  try {
    const sourceA = path.join(owner, '.tmp/artifacts/frozen/first/source');
    mkdirSync(sourceA, { recursive: true });
    const cacheA = prepareIosAcceptanceCache(sourceA);
    const archive = path.join(cacheA.sourcePackages, 'cached-package');
    mkdirSync(cacheA.sourcePackages, { recursive: true });
    writeFileSync(archive, 'verified dependency');
    const friCache = prepareFriControlPlaneCache(owner);
    writeFileSync(path.join(friCache, 'prepared.json'), '{}');
    const expired = new Date(Date.now() - 2 * 86400_000);
    utimesSync(path.dirname(sourceA), expired, expired);
    runRetention({ rootDir: owner, apply: true, scope: 'artifact' });
    expect(existsSync(sourceA)).toBe(false);
    const sourceB = path.join(owner, '.tmp/artifacts/frozen/second/source');
    mkdirSync(sourceB, { recursive: true });
    const cacheB = prepareIosAcceptanceCache(sourceB);
    expect(cacheB).toEqual(cacheA);
    expect(readFileSync(archive, 'utf8')).toBe('verified dependency');
    expect(existsSync(path.join(friCache, 'prepared.json'))).toBe(true);
    expect(existsSync(path.join(sourceB, '.cache'))).toBe(false);
    const args = createSimulatorAcceptanceBuildArgs({ repoRoot: sourceB,
      derivedData: cacheB.derivedData, udid: 'SIM', bundleId: 'com.foliole.test',
      resourceArgs: ['-disableAutomaticPackageResolution'] });
    expect(args).toContain(path.join(sourceB, 'ios/App/App.xcodeproj'));
    expect(args).toContain(path.join(cacheA.derivedData, 'PackageCache'));
    expect(args).toContain('-disableAutomaticPackageResolution');
    expect(args.at(-1)).toBe('build');
  } finally {
    rmSync(owner, { recursive: true, force: true });
  }
});

it('routes DerivedData and its heavy subcaches into one shared cache entry', () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'foliole-ios-acceptance-storage-'));
  try {
    expect(prepareIosAcceptanceCache(repoRoot)).toEqual({
      derivedData: path.join(repoRoot, '.cache/ios-acceptance-build/DerivedData'),
      moduleCache: path.join(repoRoot,
        '.cache/ios-acceptance-build/DerivedData/ModuleCache.noindex'),
      sourcePackages: path.join(repoRoot,
        '.cache/ios-acceptance-build/DerivedData/SourcePackages')
    });
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});
