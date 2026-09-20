/* global process */
import path from 'node:path';

import {
  prepareCacheEntry,
  withArtifactRun
} from '../diagnostics/local-artifact-cache-production.mjs';

export const IOS_ACCEPTANCE_ARTIFACT_ENTRY = 'ios-bridge-acceptance';
export const IOS_ACCEPTANCE_CACHE_ENTRY = 'ios-acceptance-build';
export const IOS_RUNTIME_CACHE_ENTRY = 'ios-runtime-contract';
export const FRI_CONTROL_PLANE_CACHE_ENTRY = 'fri-control-plane';

// Frozen source callers pass their persistent workspace explicitly through the environment.
export function resolveIosCacheRepoRoot(repoRoot, env = process.env) {
  const root = env.FOLIOLE_IOS_CACHE_REPO_ROOT ?? repoRoot;
  if (!root || !path.isAbsolute(root)) {
    throw new Error('iOS cache repository root must be an absolute path.');
  }
  return path.resolve(root);
}

export function resolveIosAcceptanceCache(repoRoot) {
  const cacheRoot = path.join(resolveIosCacheRepoRoot(repoRoot), '.cache', IOS_ACCEPTANCE_CACHE_ENTRY);
  const derivedData = path.join(cacheRoot, 'DerivedData');
  return {
    derivedData,
    moduleCache: path.join(derivedData, 'ModuleCache.noindex'),
    sourcePackages: path.join(derivedData, 'SourcePackages')
  };
}

export function prepareIosAcceptanceCache(repoRoot) {
  prepareCacheEntry({ entryName: IOS_ACCEPTANCE_CACHE_ENTRY,
    rootDir: resolveIosCacheRepoRoot(repoRoot) });
  return resolveIosAcceptanceCache(repoRoot);
}

export function prepareFriControlPlaneCache(repoRoot) {
  return prepareCacheEntry({ entryName: FRI_CONTROL_PLANE_CACHE_ENTRY,
    rootDir: resolveIosCacheRepoRoot(repoRoot) });
}

export function prepareIosRuntimeContractCache(repoRoot) {
  const cacheRoot = prepareCacheEntry({ entryName: IOS_RUNTIME_CACHE_ENTRY,
    rootDir: resolveIosCacheRepoRoot(repoRoot) });
  return {
    clangModuleCache: path.join(cacheRoot, 'clang'),
    scratchPath: path.join(cacheRoot, 'scratch'),
    swiftpmModuleCache: path.join(cacheRoot, 'swiftpm')
  };
}

export function withIosAcceptanceArtifacts(repoRoot, runName, produce) {
  return withArtifactRun({
    categoryName: IOS_ACCEPTANCE_ARTIFACT_ENTRY, rootDir: repoRoot, runName
  }, produce);
}
