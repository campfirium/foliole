import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app } from 'electron';

import { AGENT_CONTROL_LEARNING_IMPORT_KEY } from '../../lib/platform/agentControlLearningImport.js';
import { APP_SETTINGS_STORAGE_KEYS, DEFAULT_BASE_COLOR_MODE } from '../../src/shared/config/appSettings.js';
import {
  getLocalStorageAppSettingsKeys,
  getRuntimeAppSettingsKeys
} from '../../src/shared/config/appSettingsClassification.js';
import { isAgentControlLearningImportEnabled, saveAgentControlLearningImportPermission } from '../database/agentControlLearningImportPermission.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';
import { applyNativeBaseColorMode } from '../nativeAppearance.js';
import { writeStartupRendererHtml } from '../startupRendererPreparation.js';

const APP_SETTINGS_KEY = 'app_settings';
const RUNTIME_APP_SETTINGS_KEYS = new Set<string>(getRuntimeAppSettingsKeys());
const LOCAL_STORAGE_APP_SETTINGS_KEYS = new Set<string>(getLocalStorageAppSettingsKeys());
const RUNTIME_ONLY_APP_SETTINGS_KEYS = new Set<string>(
  getRuntimeAppSettingsKeys().filter((key) => !LOCAL_STORAGE_APP_SETTINGS_KEYS.has(key))
);
const STARTUP_RENDERER_APP_SETTINGS_KEYS = new Set<string>([
  APP_SETTINGS_STORAGE_KEYS.baseColor,
  APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent,
  APP_SETTINGS_STORAGE_KEYS.dualListWidth,
  APP_SETTINGS_STORAGE_KEYS.listCollapsed,
  APP_SETTINGS_STORAGE_KEYS.listWidth,
  APP_SETTINGS_STORAGE_KEYS.rightSidebarCollapsed,
  APP_SETTINGS_STORAGE_KEYS.rightSidebarWidth,
  APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignments,
  APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignmentsDark,
  APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette,
  APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePaletteDark
]);
const currentRuntimeDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function normalizeAppSettingsPayload(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const entries = Object.entries(payload as Record<string, unknown>);
  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof key !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(key)) {
      continue;
    }
    if (!RUNTIME_APP_SETTINGS_KEYS.has(key)) {
      continue;
    }
    if (typeof value !== 'string') {
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

function syncNativeThemeSource(settings: Record<string, string>) {
  const baseColor = settings[APP_SETTINGS_STORAGE_KEYS.baseColor];
  const mode = baseColor === 'dark' || baseColor === 'light' || baseColor === 'system'
    ? baseColor
    : DEFAULT_BASE_COLOR_MODE;
  applyNativeBaseColorMode(mode);
}

export async function loadAppSettingsState(): Promise<Record<string, string>> {
  const settings = normalizeAppSettingsPayload(loadJsonSetting(APP_SETTINGS_KEY));
  syncNativeThemeSource(settings);
  if (isAgentControlLearningImportEnabled()) settings[AGENT_CONTROL_LEARNING_IMPORT_KEY] = 'true';
  return settings;
}

export function hasStartupRendererSettingChange(
  previousSettings: Record<string, string>,
  nextSettings: Record<string, string>
) {
  for (const key of STARTUP_RENDERER_APP_SETTINGS_KEYS) {
    if (previousSettings[key] !== nextSettings[key]) {
      return true;
    }
  }
  return false;
}

export async function saveAppSettingsState(settings: Record<string, unknown>): Promise<void> {
  const { [AGENT_CONTROL_LEARNING_IMPORT_KEY]: learningImport, ...appSettings } = settings;
  if (learningImport !== undefined) {
    saveAgentControlLearningImportPermission(learningImport);
    if (Object.keys(appSettings).length === 0) return;
  }
  const incomingSettings = normalizeAppSettingsPayload(appSettings);
  const previousSettings = normalizeAppSettingsPayload(loadJsonSetting(APP_SETTINGS_KEY));
  const preservedRuntimeSettings = Object.fromEntries(
    Object.entries(previousSettings).filter(([key]) =>
      RUNTIME_ONLY_APP_SETTINGS_KEYS.has(key)
    )
  );
  const gradeMappingOnly = Object.keys(incomingSettings).length === 1
    && APP_SETTINGS_STORAGE_KEYS.superMemoGradeMap in incomingSettings;
  const nextSettings = {
    ...(gradeMappingOnly ? previousSettings : preservedRuntimeSettings),
    ...incomingSettings
  };
  saveJsonSetting(APP_SETTINGS_KEY, nextSettings);
  syncNativeThemeSource(nextSettings);
  if (!hasStartupRendererSettingChange(previousSettings, nextSettings)) {
    return;
  }
  try {
    writeStartupRendererHtml(currentRuntimeDir, nextSettings, app.getPath('userData'));
  } catch (error) {
    appendMainProcessDiagnosticLog('startup_renderer_html_settings_write_failed', { error });
  }
}
