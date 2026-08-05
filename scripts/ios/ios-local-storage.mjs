import path from 'node:path';

import {
  prepareCacheEntry,
  withArtifactBatch
} from '../diagnostics/local-artifact-cache-production.mjs';

export const IOS_ACCEPTANCE_ARTIFACT_ENTRY = 'ios-bridge-acceptance';
export const IOS_RUNTIME_CACHE_ENTRY = 'ios-runtime-contract';

export function prepareIosRuntimeContractCache(repoRoot) {
  const cacheRoot = prepareCacheEntry({ entryName: IOS_RUNTIME_CACHE_ENTRY, rootDir: repoRoot });
  return {
    clangModuleCache: path.join(cacheRoot, 'clang'),
    scratchPath: path.join(cacheRoot, 'scratch'),
    swiftpmModuleCache: path.join(cacheRoot, 'swiftpm')
  };
}

export function withIosAcceptanceArtifacts(repoRoot, produce) {
  return withArtifactBatch({ entryName: IOS_ACCEPTANCE_ARTIFACT_ENTRY, rootDir: repoRoot }, produce);
}
