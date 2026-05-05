import { resolveRuntimeAppPaths, type RuntimeAppPaths } from './bridge';

let appPathsPromise: Promise<RuntimeAppPaths | null> | null = null;

export function getRuntimeAppPaths() {
  if (!appPathsPromise) {
    appPathsPromise = resolveRuntimeAppPaths();
  }
  return appPathsPromise;
}

export function resetRuntimeAppPathsCacheForTest() {
  appPathsPromise = null;
}
