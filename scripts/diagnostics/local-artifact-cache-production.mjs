import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  ARTIFACT_ROOT,
  CACHE_ROOT,
  refreshArtifactRun,
  refreshCacheEntry
} from './local-artifact-cache-retention.mjs';

export function prepareCacheEntry({ entryName, nowMs = Date.now(), rootDir }) {
  const entryPath = path.join(rootDir, CACHE_ROOT, entryName);
  mkdirSync(entryPath, { recursive: true });
  refreshCacheEntry({ entryName, nowMs, rootDir });
  return entryPath;
}

export async function withArtifactRun({ categoryName, rootDir, runName }, produce) {
  try {
    return await produce();
  } finally {
    const entryPath = path.join(rootDir, ARTIFACT_ROOT, categoryName, runName);
    if (existsSync(entryPath)) refreshArtifactRun({ categoryName, rootDir, runName });
  }
}
