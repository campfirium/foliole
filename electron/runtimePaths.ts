import path from 'node:path';

type ExistsSync = (filePath: string) => boolean;

function resolveCurrentPreloadScriptPath(runtimeDir: string) {
  return path.join(runtimeDir, '..', '..', 'electron', 'preload.cjs');
}

function resolveFirstExistingPath(candidates: string[], existsSync: ExistsSync) {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolvePreloadScriptPath(runtimeDir: string, existsSync: ExistsSync) {
  const currentPreloadPath = resolveCurrentPreloadScriptPath(runtimeDir);
  if (existsSync(currentPreloadPath)) {
    return currentPreloadPath;
  }

  return currentPreloadPath;
}

export function resolveRendererIndexPath(runtimeDir: string, existsSync: ExistsSync) {
  const resolved = resolveFirstExistingPath(
    [
      path.join(runtimeDir, '..', '..', 'dist', 'desktop', 'index.html'),
      path.join(runtimeDir, '..', 'dist', 'desktop', 'index.html')
    ],
    existsSync
  );

  return resolved ?? path.join(runtimeDir, '..', '..', 'dist', 'desktop', 'index.html');
}
