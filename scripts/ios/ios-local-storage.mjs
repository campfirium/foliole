import path from 'node:path';

import {
  prepareCacheEntry,
  withArtifactRun
} from '../diagnostics/local-artifact-cache-production.mjs';

export const IOS_ACCEPTANCE_ARTIFACT_ENTRY = 'ios-bridge-acceptance';
export const IOS_ACCEPTANCE_CACHE_ENTRY = 'ios-acceptance-build';
export const IOS_RUNTIME_CACHE_ENTRY = 'ios-runtime-contract';

export function resolveIosAcceptanceCache(repoRoot) {
  const cacheRoot = path.join(repoRoot, '.cache', IOS_ACCEPTANCE_CACHE_ENTRY);
  const derivedData = path.join(cacheRoot, 'DerivedData');
  return {
    derivedData,
    moduleCache: path.join(derivedData, 'ModuleCache.noindex'),
    sourcePackages: path.join(derivedData, 'SourcePackages')
  };
}

export function prepareIosAcceptanceCache(repoRoot) {
  prepareCacheEntry({ entryName: IOS_ACCEPTANCE_CACHE_ENTRY, rootDir: repoRoot });
  return resolveIosAcceptanceCache(repoRoot);
}

export function prepareIosRuntimeContractCache(repoRoot) {
  const cacheRoot = prepareCacheEntry({ entryName: IOS_RUNTIME_CACHE_ENTRY, rootDir: repoRoot });
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
