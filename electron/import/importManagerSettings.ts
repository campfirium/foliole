import {
  applyReadwiseRootPath,
  createDefaultImportManagerSettings,
  normalizeImportManagerSettings,
  type ImportManagerSettings
} from '../../lib/core/import/importManagerSettings.js';
import { watchedBindingToSource } from '../../lib/core/import/watchedFolderBinding.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { loadOrCreateDesktopInstallationIdentity } from '../desktopInstallationIdentity.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';
import { assertNoUnsafePathOverlap, type SafetyPathCandidate } from '../libraryPathSafety.js';

import {
  isReadwiseExecutionEnabled,
  loadReadwiseDeviceSettings,
  loadReadwiseRuntimeState,
  saveReadwiseActiveSelection,
  saveReadwiseDeviceSettings
} from './readwiseDeviceSettings.js';
import { ensureSourceOwnershipCutover } from './sourceOwnershipCutover.js';
import {
  loadLocalExecutableWatchedBindings,
  loadWatchedFolderBindings,
  saveLocalWatchedSources
} from './watchedFolderBindings.js';

const IMPORT_MANAGER_SETTINGS_KEY = 'import_manager_settings';

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toImportSourcePathCandidates(settings: ImportManagerSettings): SafetyPathCandidate[] {
  return settings.sources.filter((source) => source.ownership?.editable !== false).flatMap((source, index) => [
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
    ensureSourceOwnershipCutover();
    const normalized = normalizeImportManagerSettings({
      ...toRecord(loadJsonSetting(IMPORT_MANAGER_SETTINGS_KEY)),
      ...loadReadwiseDeviceSettings(),
      ...loadReadwiseRuntimeState()
    });
    const identity = loadOrCreateDesktopInstallationIdentity();
    const bindings = loadWatchedFolderBindings();
    return {
      ...normalized,
      sources: bindings.length > 0
        ? bindings.map((binding) => watchedBindingToSource(binding, identity.installationId))
        : createDefaultImportManagerSettings().sources
    };
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
  ensureSourceOwnershipCutover();
  saveLocalWatchedSources(normalized.sources, normalized.updatedAt);
  saveReadwiseDeviceSettings(normalized, normalized.updatedAt);
  saveReadwiseActiveSelection(normalized, normalized.updatedAt);
  const canonical = { ...normalized } as Partial<ImportManagerSettings>;
  delete canonical.sources;
  delete canonical.readwiseActiveDeviceName;
  delete canonical.readwiseActiveInstallationId;
  delete canonical.readwiseCurrentDeviceName;
  delete canonical.readwiseCurrentInstallationId;
  delete canonical.readwiseReaderConfig;
  delete canonical.readwiseRootPath;
  delete canonical.readwiseSettingsConfirmed;
  delete canonical.readwiseSources;
  saveJsonSetting(IMPORT_MANAGER_SETTINGS_KEY, canonical, normalized.updatedAt);
  return loadImportManagerSettings();
}

export function loadExecutableImportManagerSettings(): ImportManagerSettings {
  const settings = loadImportManagerSettings();
  return {
    ...settings,
    ...(!isReadwiseExecutionEnabled(settings) ? {
      readwiseReaderConfig: { ...settings.readwiseReaderConfig, enabled: false },
      readwiseSources: []
    } : {}),
    sources: loadLocalExecutableWatchedBindings().map((binding) => watchedBindingToSource(binding))
  };
}
