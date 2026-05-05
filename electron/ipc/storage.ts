import { promises as fs } from 'node:fs';
import path from 'node:path';

import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import { resolveAppPaths } from './paths.js';

const APP_SETTINGS_KEY = 'app_settings';
const LEGACY_WORKSPACE_FILE_NAME = 'foliole-workspace-v1.json';
const LEGACY_WORKSPACE_LAYOUT_SETTING_KEYS = {
  documentMaxWidth: 'foliole-workspace-document-width',
  isListCollapsed: 'foliole-workspace-list-collapsed',
  isRightSidebarCollapsed: 'foliole-workspace-right-sidebar-collapsed',
  listWidth: 'foliole-workspace-list-width',
  rightSidebarWidth: 'foliole-workspace-right-sidebar-width'
} as const;

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
    if (typeof value !== 'string') {
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

function normalizeLegacyLayoutPreference(
  key: keyof typeof LEGACY_WORKSPACE_LAYOUT_SETTING_KEYS,
  value: unknown
) {
  if (
    (key === 'documentMaxWidth' || key === 'listWidth' || key === 'rightSidebarWidth') &&
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return String(value);
  }
  if (
    (key === 'isListCollapsed' || key === 'isRightSidebarCollapsed') &&
    typeof value === 'boolean'
  ) {
    return value ? 'true' : 'false';
  }
  return null;
}

function normalizeLegacyWorkspaceLayoutPayload(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const layout = (payload as { state?: { layout?: unknown } }).state?.layout;
  if (!layout || typeof layout !== 'object') {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [legacyKey, appSettingsKey] of Object.entries(LEGACY_WORKSPACE_LAYOUT_SETTING_KEYS)) {
    const value = normalizeLegacyLayoutPreference(
      legacyKey as keyof typeof LEGACY_WORKSPACE_LAYOUT_SETTING_KEYS,
      (layout as Record<string, unknown>)[legacyKey]
    );
    if (value !== null) {
      normalized[appSettingsKey] = value;
    }
  }
  return normalized;
}

async function loadLegacyWorkspaceLayoutFallback() {
  const legacyWorkspacePath = path.join(
    resolveAppPaths().app_data_dir,
    'workspace',
    LEGACY_WORKSPACE_FILE_NAME
  );
  try {
    const payload = await fs.readFile(legacyWorkspacePath, 'utf8');
    return normalizeLegacyWorkspaceLayoutPayload(JSON.parse(payload));
  } catch {
    return {};
  }
}

export async function loadAppSettingsState(): Promise<Record<string, string>> {
  const appSettings = normalizeAppSettingsPayload(loadJsonSetting(APP_SETTINGS_KEY));
  const fallbackKeys = Object.values(LEGACY_WORKSPACE_LAYOUT_SETTING_KEYS).filter(
    (key) => appSettings[key] === undefined
  );
  if (fallbackKeys.length === 0) {
    return appSettings;
  }

  const legacyFallback = await loadLegacyWorkspaceLayoutFallback();
  const mergedFallback: Record<string, string> = {};
  for (const key of fallbackKeys) {
    const value = legacyFallback[key];
    if (typeof value === 'string') {
      mergedFallback[key] = value;
    }
  }
  return {
    ...mergedFallback,
    ...appSettings
  };
}

export async function saveAppSettingsState(settings: Record<string, unknown>): Promise<void> {
  saveJsonSetting(APP_SETTINGS_KEY, normalizeAppSettingsPayload(settings));
}
