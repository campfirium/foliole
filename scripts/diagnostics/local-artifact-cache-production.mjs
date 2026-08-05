import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  ARTIFACT_ROOT,
  CACHE_ROOT,
  refreshArtifactBatch,
  refreshCacheEntry,
  runRetention
} from './local-artifact-cache-retention.mjs';

function requireSuccessfulMaintenance(result) {
  if (result.ok) return result;
  const failedPaths = result.failures.map((failure) => failure.path).join(', ');
  throw new Error(`Local artifact/cache maintenance failed: ${failedPaths}`);
}

export function maintainBeforeProduction(options = {}) {
  return requireSuccessfulMaintenance(runRetention({ ...options, apply: true, scope: 'all' }));
}

export function prepareCacheEntry({ entryName, nowMs = Date.now(), rootDir, ...options }) {
  const entryPath = path.join(rootDir, CACHE_ROOT, entryName);
  mkdirSync(entryPath, { recursive: true });
  refreshCacheEntry({ entryName, nowMs, rootDir });
  maintainBeforeProduction({ ...options, nowMs, rootDir });
  return entryPath;
}

export async function withArtifactBatch({ entryName, nowMs = Date.now(), rootDir, ...options }, produce) {
  maintainBeforeProduction({ ...options, nowMs, rootDir });
  try {
    return await produce();
  } finally {
    const entryPath = path.join(rootDir, ARTIFACT_ROOT, entryName);
    if (existsSync(entryPath)) refreshArtifactBatch({ entryName, rootDir });
  }
}
