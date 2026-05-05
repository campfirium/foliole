import path from 'node:path';

type ExistsSync = (filePath: string) => boolean;

function resolveFirstExistingPath(candidates: string[], existsSync: ExistsSync) {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolvePreloadScriptPath(runtimeDir: string, existsSync: ExistsSync) {
  const resolved = resolveFirstExistingPath(
    [
      path.join(runtimeDir, '..', '..', 'electron', 'preload.cjs'),
      path.join(runtimeDir, '..', 'preload.cjs'),
      path.join(runtimeDir, '..', 'electron', 'preload.cjs'),
      path.join(runtimeDir, 'preload.cjs')
    ],
    existsSync
  );

  return resolved ?? path.join(runtimeDir, '..', 'preload.cjs');
}

export function resolveRendererIndexPath(runtimeDir: string, existsSync: ExistsSync) {
  const resolved = resolveFirstExistingPath(
    [
      path.join(runtimeDir, '..', '..', 'dist', 'index.html'),
      path.join(runtimeDir, '..', 'dist', 'index.html')
    ],
    existsSync
  );

  return resolved ?? path.join(runtimeDir, '..', '..', 'dist', 'index.html');
}
