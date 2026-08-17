import fs from 'node:fs';

import {
  applyReadwiseRootPath,
  createDefaultImportManagerSettings,
  normalizeImportManagerSettings,
  type ImportManagerSettings
} from '../../lib/core/import/importManagerSettings.js';
import { normalizeReadwiseActiveSelection } from '../../lib/core/import/readwiseDeviceSelection.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { loadOrCreateDesktopInstallationIdentity } from '../desktopInstallationIdentity.js';

const ACTIVE_KEY = 'readwise_active_installation';
const DEVICE_KEY = 'readwise_device_settings';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function loadReadwiseDeviceSettings(): Pick<ImportManagerSettings,
  'readwiseReaderConfig' | 'readwiseRootPath' | 'readwiseSettingsConfirmed' | 'readwiseSources'> {
  const raw = record(loadJsonSetting(DEVICE_KEY));
  const normalized = normalizeImportManagerSettings(raw);
  return {
    readwiseReaderConfig: normalized.readwiseReaderConfig,
    readwiseRootPath: normalized.readwiseRootPath,
    readwiseSettingsConfirmed: typeof raw.confirmedAt === 'string' && raw.confirmedAt.length > 0,
    readwiseSources: normalized.readwiseSources
  };
}

export function saveReadwiseDeviceSettings(settings: ImportManagerSettings, updatedAt: string) {
  saveJsonSetting(DEVICE_KEY, {
    confirmedAt: updatedAt,
    readwiseReaderConfig: settings.readwiseReaderConfig,
    readwiseRootPath: settings.readwiseRootPath,
    readwiseSources: settings.readwiseSources,
    version: settings.version
  }, updatedAt);
}

export function loadReadwiseRuntimeState() {
  const identity = loadOrCreateDesktopInstallationIdentity();
  const active = normalizeReadwiseActiveSelection(loadJsonSetting(ACTIVE_KEY));
  return {
    readwiseActiveDeviceName: active?.deviceName || null,
    readwiseActiveInstallationId: active?.installationId ?? null,
    readwiseCurrentDeviceName: identity.deviceName,
    readwiseCurrentInstallationId: identity.installationId
  };
}

export function saveReadwiseActiveSelection(settings: ImportManagerSettings, updatedAt: string) {
  const installationId = settings.readwiseActiveInstallationId?.trim() ?? '';
  if (!installationId) {
    saveJsonSetting(ACTIVE_KEY, null, updatedAt);
    return;
  }
  const identity = loadOrCreateDesktopInstallationIdentity();
  const current = normalizeReadwiseActiveSelection(loadJsonSetting(ACTIVE_KEY));
  saveJsonSetting(ACTIVE_KEY, installationId === identity.installationId ? {
    deviceName: identity.deviceName,
    installationId,
    platform: identity.platform
  } : current, updatedAt);
}

export function isReadwiseExecutionEnabled(settings: ImportManagerSettings) {
  if (!settings.readwiseSettingsConfirmed || !settings.readwiseReaderConfig.enabled) return false;
  if (!settings.readwiseCurrentInstallationId ||
    settings.readwiseActiveInstallationId !== settings.readwiseCurrentInstallationId) return false;
  return isDirectory(settings.readwiseRootPath) && settings.readwiseSources
    .filter((source) => source.keepState === 'enabled')
    .every((source) => isDirectory(source.primaryPath) &&
      (source.highlightMode !== 'split' || isDirectory(source.highlightPath)));
}

export function assertReadwiseExecutionEnabled() {
  const settings = loadCombinedReadwiseSettings();
  if (!isReadwiseExecutionEnabled(settings)) throw new Error('readwise_not_active_on_this_device');
  return settings;
}

export function loadCombinedReadwiseSettings() {
  const defaults = createDefaultImportManagerSettings();
  const device = loadReadwiseDeviceSettings();
  const runtime = loadReadwiseRuntimeState();
  return normalizeImportManagerSettings({ ...defaults, ...device, ...runtime });
}

export function createLegacyReadwiseDeviceDraft(value: unknown) {
  const legacy = normalizeImportManagerSettings(value);
  return {
    confirmedAt: null,
    readwiseReaderConfig: { ...legacy.readwiseReaderConfig, enabled: false },
    readwiseRootPath: legacy.readwiseRootPath,
    readwiseSources: applyReadwiseRootPath(legacy.readwiseSources, legacy.readwiseRootPath),
    version: legacy.version
  };
}

function isDirectory(value: string) {
  if (!value.trim()) return false;
  try { return fs.statSync(value).isDirectory(); } catch { return false; }
}
