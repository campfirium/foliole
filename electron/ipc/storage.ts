import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app } from 'electron';

import { APP_SETTINGS_STORAGE_KEYS } from '../../src/shared/config/appSettings.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { writePrebuiltRendererHtmlForSettings } from '../runtimeRendererHtml.js';

const APP_SETTINGS_KEY = 'app_settings';
const RUNTIME_ONLY_APP_SETTINGS_KEYS = new Set<string>([
  APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled
]);
const currentRuntimeDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function resolveRendererUrl() {
  return process.env.ELECTRON_RENDERER_URL ?? null;
}

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

export async function loadAppSettingsState(): Promise<Record<string, string>> {
  return normalizeAppSettingsPayload(loadJsonSetting(APP_SETTINGS_KEY));
}

export async function saveAppSettingsState(settings: Record<string, unknown>): Promise<void> {
  const incomingSettings = normalizeAppSettingsPayload(settings);
  const preservedRuntimeSettings = Object.fromEntries(
    Object.entries(normalizeAppSettingsPayload(loadJsonSetting(APP_SETTINGS_KEY))).filter(([key]) =>
      RUNTIME_ONLY_APP_SETTINGS_KEYS.has(key)
    )
  );
  const nextSettings = {
    ...preservedRuntimeSettings,
    ...incomingSettings
  };
  saveJsonSetting(APP_SETTINGS_KEY, nextSettings);
  try {
    writePrebuiltRendererHtmlForSettings(currentRuntimeDir, nextSettings, resolveRendererUrl(), app.getPath('userData'));
  } catch (error) {
    console.warn('[electron-main] failed to prebuild startup renderer html', error);
  }
}
