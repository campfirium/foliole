/* global process */

import { mkdir, utimes } from 'node:fs/promises';
import path from 'node:path';

export function runtimeDownloadCacheEnv(repoRoot) {
  return { FOLIOLE_RUNTIME_DOWNLOAD_CACHE: path.resolve(repoRoot, '.cache/desktop-runtime-downloads') };
}

// Only immutable, checksum-verified archives are shared. Extraction stays source-local.
export async function runtimeArchivePath(localPath, sha256, env = process.env) {
  const root = env.FOLIOLE_RUNTIME_DOWNLOAD_CACHE;
  if (!root) return localPath;
  if (!path.isAbsolute(root)) throw new Error('Runtime download cache must be an absolute path');
  await mkdir(root, { recursive: true });
  const now = new Date();
  await utimes(root, now, now);
  return path.join(root, `${sha256}-${path.basename(localPath)}`);
}
