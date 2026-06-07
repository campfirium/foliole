import {
  createDefaultImportManagerSettings,
  normalizeImportManagerSettings,
  type ImportManagerSettings
} from '../../../lib/core/import/importManagerSettings';
import {
  hasAppRuntimeCommandRepository,
  loadImportManagerSettingsFromRuntime,
  saveImportManagerSettingsToRuntime
} from '../../shared/platform/appRuntimeCommandRepository';

export const IMPORT_SOURCE_WORKSPACE_SETTINGS_CHANGED_EVENT =
  'foliole:import-source-workspace-settings-changed';

let importSourceWorkspaceSettingsCache: ImportManagerSettings | null = null;
let importSourceWorkspaceSettingsLoadPromise: Promise<ImportManagerSettings> | null = null;

export function resetImportSourceWorkspaceSettingsCacheForTest() {
  importSourceWorkspaceSettingsCache = null;
  importSourceWorkspaceSettingsLoadPromise = null;
}

function notifyImportSourceWorkspaceSettingsChanged(settings: ImportManagerSettings) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(IMPORT_SOURCE_WORKSPACE_SETTINGS_CHANGED_EVENT, { detail: settings })
  );
}

export async function loadImportSourceWorkspaceSettings(): Promise<ImportManagerSettings> {
  if (importSourceWorkspaceSettingsCache) {
    return importSourceWorkspaceSettingsCache;
  }
  if (importSourceWorkspaceSettingsLoadPromise) {
    return importSourceWorkspaceSettingsLoadPromise;
  }
  importSourceWorkspaceSettingsLoadPromise = loadImportSourceWorkspaceSettingsFromSource().then((settings) => {
    importSourceWorkspaceSettingsCache = settings;
    return settings;
  }).finally(() => {
    importSourceWorkspaceSettingsLoadPromise = null;
  });
  return importSourceWorkspaceSettingsLoadPromise;
}

async function loadImportSourceWorkspaceSettingsFromSource(): Promise<ImportManagerSettings> {
  if (!hasAppRuntimeCommandRepository()) {
    return createDefaultImportManagerSettings();
  }
  try {
    return normalizeImportManagerSettings(await loadImportManagerSettingsFromRuntime());
  } catch {
    return createDefaultImportManagerSettings();
  }
}

export async function saveImportSourceWorkspaceSettings(settings: ImportManagerSettings) {
  if (!hasAppRuntimeCommandRepository()) {
    importSourceWorkspaceSettingsCache = settings;
    notifyImportSourceWorkspaceSettingsChanged(settings);
    return settings;
  }
  try {
    const nextSettings = normalizeImportManagerSettings(
      await saveImportManagerSettingsToRuntime(settings)
    );
    importSourceWorkspaceSettingsCache = nextSettings;
    notifyImportSourceWorkspaceSettingsChanged(nextSettings);
    return nextSettings;
  } catch {
    importSourceWorkspaceSettingsCache = settings;
    notifyImportSourceWorkspaceSettingsChanged(settings);
    return settings;
  }
}
