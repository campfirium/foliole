import {
  applyReadwiseRootPath,
  normalizeImportManagerSettings,
  type ImportManagerSettings
} from '../../lib/core/import/importManagerSettings.js';
import {
  normalizeReadwiseHostSettings,
  READWISE_HOST_SETTINGS_KEY,
  withoutReadwiseImportManagerFields
} from '../../lib/core/import/readwiseHostSettings.js';
import { openDatabaseConnection } from '../database/connection.js';
import {
  hydrateWatchedImportManagerSources,
  upsertWatchedImportManagerSources
} from '../database/desktopSources.js';
import {
  hydrateCurrentHostReadwiseSources,
  saveCurrentHostReadwiseSources
} from '../database/readwiseSources.js';
import { loadJsonSetting, writeJsonSetting } from '../database/settingsStore.js';
import { upsertChangedWatchedFolderSource } from '../database/watchedFolderBindings.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';
import { assertNoUnsafePathOverlap, type SafetyPathCandidate } from '../libraryPathSafety.js';

const IMPORT_MANAGER_SETTINGS_KEY = 'import_manager_settings';

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toImportSourcePathCandidates(settings: ImportManagerSettings): SafetyPathCandidate[] {
  return settings.sources.flatMap((source, index) => [
    { label: `Watched folder ${index + 1}`, path: source.primaryPath },
    { label: `Watched highlight folder ${index + 1}`, path: source.highlightPath }
  ]);
}

function assertSafeImportManagerPaths(settings: ImportManagerSettings) {
  const libraryPaths = loadLibraryPathSettingsSync();
  assertNoUnsafePathOverlap([
    { label: 'Assets', path: libraryPaths.assets_dir },
    { label: 'Data', path: libraryPaths.data_dir },
    { label: 'Inbox', path: libraryPaths.inbox },
    { label: 'Mirror', path: libraryPaths.mirror },
    { label: 'Readwise Reader folder', path: settings.readwiseRootPath },
    ...toImportSourcePathCandidates(settings)
  ]);
}

function watchedSourceChanged(
  previous: ImportManagerSettings['sources'][number] | undefined,
  next: ImportManagerSettings['sources'][number]
) {
  if (!previous) return true;
  return ['actionMode', 'archivePath', 'highlightMode', 'highlightPath', 'primaryPath']
    .some((key) => previous[key as keyof typeof previous] !== next[key as keyof typeof next]);
}

export function loadImportManagerSettings(): ImportManagerSettings {
  const globalSettings = hydrateWatchedImportManagerSources(
    normalizeImportManagerSettings(loadJsonSetting(IMPORT_MANAGER_SETTINGS_KEY))
  );
  const hostSettings = normalizeReadwiseHostSettings(loadJsonSetting(READWISE_HOST_SETTINGS_KEY));
  return {
    ...globalSettings,
    readwiseReaderConfig: hostSettings.readwiseReaderConfig,
    readwiseRootPath: hostSettings.readwiseRootPath,
    readwiseSources: hydrateCurrentHostReadwiseSources(globalSettings.readwiseSources)
  };
}

export function saveImportManagerSettings(settings: unknown): ImportManagerSettings {
  const payload = toRecord(settings);
  const current = loadImportManagerSettings();
  const readwiseRootPath = typeof payload.readwiseRootPath === 'string' ? payload.readwiseRootPath : current.readwiseRootPath;
  let normalized = normalizeImportManagerSettings({
    ...current,
    ...payload,
    readwiseRootPath,
    readwiseSources: Array.isArray(payload.readwiseSources)
      ? payload.readwiseSources
      : applyReadwiseRootPath(current.readwiseSources, readwiseRootPath),
    updatedAt: new Date().toISOString()
  });
  assertSafeImportManagerPaths(normalized);
  openDatabaseConnection().driver.transaction((driver) => {
    normalized = {
      ...normalized,
      readwiseSources: saveCurrentHostReadwiseSources(normalized.readwiseSources, normalized.updatedAt)
    };
    upsertWatchedImportManagerSources(normalized);
    normalized.sources.forEach((source) => {
      if (watchedSourceChanged(current.sources.find((item) => item.id === source.id), source)) {
        upsertChangedWatchedFolderSource(source, normalized.updatedAt);
      }
    });
    writeJsonSetting(
      driver,
      IMPORT_MANAGER_SETTINGS_KEY,
      withoutReadwiseImportManagerFields(normalized),
      normalized.updatedAt
    );
    writeJsonSetting(driver, READWISE_HOST_SETTINGS_KEY, normalizeReadwiseHostSettings(normalized), normalized.updatedAt);
  });
  return normalized;
}
