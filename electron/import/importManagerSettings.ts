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
    const ownership = ensureSourceOwnershipCutover();
    const normalized = normalizeImportManagerSettings(loadJsonSetting(IMPORT_MANAGER_SETTINGS_KEY));
    if (!ownership.cutover) {
      return {
        ...normalized,
        sources: normalized.sources.map((source) => ({
          ...source,
          ownership: {
            claimState: 'unassigned', editable: false, ownerDeviceName: null,
            ownerInstallationId: null, ownerPlatform: null
          }
        })),
        watchedFoldersReady: false,
        watchedFoldersReason: ownership.readiness.reason
      };
    }
    const identity = loadOrCreateDesktopInstallationIdentity();
    const bindings = loadWatchedFolderBindings();
    return {
      ...normalized,
      sources: bindings.length > 0
        ? bindings.map((binding) => watchedBindingToSource(binding, identity.installationId))
        : createDefaultImportManagerSettings().sources,
      watchedFoldersReady: ownership.readiness.ready,
      watchedFoldersReason: ownership.readiness.reason
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
  const ownership = ensureSourceOwnershipCutover();
  if (!ownership.cutover) {
    const rawSources = toRecord(loadJsonSetting(IMPORT_MANAGER_SETTINGS_KEY)).sources;
    const preserved = {
      ...normalized,
      sources: Array.isArray(rawSources)
        ? rawSources
        : current.sources.map((source) => {
            const copy = { ...source };
            delete copy.ownership;
            return copy;
          })
    };
    saveJsonSetting(IMPORT_MANAGER_SETTINGS_KEY, preserved, normalized.updatedAt);
    return loadImportManagerSettings();
  }
  if (ownership.readiness.ready) saveLocalWatchedSources(normalized.sources, normalized.updatedAt);
  const canonical = { ...normalized } as Partial<ImportManagerSettings>;
  delete canonical.sources;
  delete canonical.watchedFoldersReady;
  delete canonical.watchedFoldersReason;
  saveJsonSetting(IMPORT_MANAGER_SETTINGS_KEY, canonical, normalized.updatedAt);
  return loadImportManagerSettings();
}

export function loadExecutableImportManagerSettings(): ImportManagerSettings {
  const settings = loadImportManagerSettings();
  if (!settings.watchedFoldersReady) return { ...settings, sources: [] };
  return {
    ...settings,
    sources: loadLocalExecutableWatchedBindings().map((binding) => watchedBindingToSource(binding))
  };
}
