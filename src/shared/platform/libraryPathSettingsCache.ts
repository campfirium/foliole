import type { RuntimeLibraryPaths } from './libraryPathsRuntimeRepository';

let cache: RuntimeLibraryPaths | null | undefined;
let loadPromise: Promise<RuntimeLibraryPaths | null> | null = null;

export function loadCachedRuntimeLibraryPathSettings(
  loadFromSource: () => Promise<RuntimeLibraryPaths | null>
) {
  if (cache !== undefined) {
    return Promise.resolve(cache);
  }
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = loadFromSource().then((settings) => {
    cache = settings;
    return settings;
  }).finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

export function setRuntimeLibraryPathSettingsCache(settings: RuntimeLibraryPaths) {
  cache = settings;
}

export function resetRuntimeLibraryPathSettingsCacheForTest() {
  cache = undefined;
  loadPromise = null;
}
