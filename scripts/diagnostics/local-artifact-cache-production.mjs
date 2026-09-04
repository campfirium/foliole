import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  ARTIFACT_ROOT,
  CACHE_ROOT,
  refreshArtifactRun,
  refreshCacheEntry,
  runRetention
} from './local-artifact-cache-retention.mjs';
import { runCleanup } from './cleanup-local-artifacts.mjs';

function requireSuccessfulMaintenance(result) {
  if (result.ok) return result;
  const failedPaths = result.failures.map((failure) => failure.path).join(', ');
  throw new Error(`Local artifact/cache maintenance failed: ${failedPaths}`);
}

export function maintainBeforeProduction(options = {}) {
  const cleanup = runCleanup({
    apply: true, days: 7, dryRun: false,
    nowMs: options.nowMs ?? Date.now(), rootDir: options.rootDir
  });
  const retention = requireSuccessfulMaintenance(
    runRetention({ ...options, apply: true, scope: 'all' })
  );
  return { cleanup, retention };
}

export function prepareCacheEntry({ entryName, nowMs = Date.now(), rootDir, ...options }) {
  const entryPath = path.join(rootDir, CACHE_ROOT, entryName);
  mkdirSync(entryPath, { recursive: true });
  refreshCacheEntry({ entryName, nowMs, rootDir });
  maintainBeforeProduction({ ...options, nowMs, rootDir });
  return entryPath;
}

export async function withArtifactRun({
  categoryName, nowMs = Date.now(), rootDir, runName, ...options
}, produce) {
  maintainBeforeProduction({ ...options, nowMs, rootDir });
  try {
    return await produce();
  } finally {
    const entryPath = path.join(rootDir, ARTIFACT_ROOT, categoryName, runName);
    if (existsSync(entryPath)) refreshArtifactRun({ categoryName, rootDir, runName });
  }
}
