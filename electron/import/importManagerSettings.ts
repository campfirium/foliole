import {
  applyReadwiseRootPath,
  createDefaultImportManagerSettings,
  normalizeImportManagerSettings,
  type ImportManagerSettings
} from '../../lib/core/import/importManagerSettings.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
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

export function loadImportManagerSettings(): ImportManagerSettings {
  try {
    return normalizeImportManagerSettings(loadJsonSetting(IMPORT_MANAGER_SETTINGS_KEY));
  } catch {
    return createDefaultImportManagerSettings();
  }
}

export function saveImportManagerSettings(settings: unknown): ImportManagerSettings {
  const payload = toRecord(settings);
  const current = loadImportManagerSettings();
  const readwiseRootPath = typeof payload.readwiseRootPath === 'string' ? payload.readwiseRootPath : current.readwiseRootPath;
  const normalized = normalizeImportManagerSettings({
    ...current,
    ...payload,
    readwiseRootPath,
    readwiseSources: Array.isArray(payload.readwiseSources)
      ? payload.readwiseSources
      : applyReadwiseRootPath(current.readwiseSources, readwiseRootPath),
    updatedAt: new Date().toISOString()
  });
  assertSafeImportManagerPaths(normalized);
  saveJsonSetting(IMPORT_MANAGER_SETTINGS_KEY, normalized, normalized.updatedAt);
  return normalized;
}
