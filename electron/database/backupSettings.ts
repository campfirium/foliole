import fs from 'node:fs';
import path from 'node:path';

import { normalizeLibraryPath } from '../../lib/platform/libraryPaths.js';
import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';
import { resolveAppPaths } from '../ipc/paths.js';

const BACKUP_SETTINGS_FILE = 'backup-settings.json';
const DEFAULT_UPDATED_AT = '1970-01-01T00:00:00.000Z';
const GIGABYTE_BYTES = 1024 * 1024 * 1024;

interface StoredBackupSettings {
  auto_daily_days?: unknown;
  auto_hourly_hours?: unknown;
  auto_monthly_months?: unknown;
  auto_weekly_weeks?: unknown;
  backup_dir?: unknown;
  manual_max_count?: unknown;
  snapshot_max_count?: unknown;
  total_size_limit_bytes?: unknown;
  updated_at?: unknown;
}

export const DEFAULT_BACKUP_SETTINGS: NativeBackupSettings = {
  auto_daily_days: 7,
  auto_hourly_hours: 24,
  auto_monthly_months: 0,
  auto_weekly_weeks: 4,
  backup_dir: '',
  manual_max_count: 10,
  snapshot_max_count: 5,
  total_size_limit_bytes: 2 * GIGABYTE_BYTES,
  updated_at: DEFAULT_UPDATED_AT
};

function resolveBackupSettingsFilePath() {
  return path.join(resolveAppPaths().app_config_dir, BACKUP_SETTINGS_FILE);
}

function readStoredBackupSettings() {
  const settingsPath = resolveBackupSettingsFilePath();
  if (!fs.existsSync(settingsPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw) as StoredBackupSettings;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.round(value));
}

export function normalizeBackupSettings(payload: unknown): NativeBackupSettings {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return DEFAULT_BACKUP_SETTINGS;
  }
  const value = payload as StoredBackupSettings;
  return {
    auto_daily_days: normalizePositiveInteger(
      value.auto_daily_days,
      DEFAULT_BACKUP_SETTINGS.auto_daily_days
    ),
    auto_hourly_hours: normalizePositiveInteger(
      value.auto_hourly_hours,
      DEFAULT_BACKUP_SETTINGS.auto_hourly_hours
    ),
    auto_monthly_months: normalizePositiveInteger(
      value.auto_monthly_months,
      DEFAULT_BACKUP_SETTINGS.auto_monthly_months
    ),
    auto_weekly_weeks: normalizePositiveInteger(
      value.auto_weekly_weeks,
      DEFAULT_BACKUP_SETTINGS.auto_weekly_weeks
    ),
    backup_dir: normalizeLibraryPath(value.backup_dir) ?? '',
    manual_max_count: Math.max(
      1,
      normalizePositiveInteger(value.manual_max_count, DEFAULT_BACKUP_SETTINGS.manual_max_count)
    ),
    snapshot_max_count: Math.max(
      1,
      normalizePositiveInteger(value.snapshot_max_count, DEFAULT_BACKUP_SETTINGS.snapshot_max_count)
    ),
    total_size_limit_bytes: Math.max(
      0,
      normalizePositiveInteger(
        value.total_size_limit_bytes,
        DEFAULT_BACKUP_SETTINGS.total_size_limit_bytes
      )
    ),
    updated_at:
      typeof value.updated_at === 'string' && value.updated_at.trim().length > 0
        ? value.updated_at
        : DEFAULT_BACKUP_SETTINGS.updated_at
  };
}

function saveStoredBackupSettings(settings: NativeBackupSettings) {
  const settingsPath = resolveBackupSettingsFilePath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

export function loadBackupSettings(): NativeBackupSettings {
  return normalizeBackupSettings(readStoredBackupSettings());
}

export function saveBackupSettings(
  settings: Partial<NativeBackupSettings> & { updated_at?: string }
): NativeBackupSettings {
  const current = loadBackupSettings();
  const normalized = normalizeBackupSettings({
    ...current,
    ...settings,
    updated_at: settings.updated_at ?? new Date().toISOString()
  });
  saveStoredBackupSettings(normalized);
  return normalized;
}

export function resolveManagedBackupDirectory(settings = loadBackupSettings()) {
  if (settings.backup_dir) {
    return settings.backup_dir;
  }
  return path.join(loadLibraryPathSettingsSync().library_home, 'Backups');
}

export function ensureManagedBackupDirectory(settings = loadBackupSettings()) {
  const directoryPath = resolveManagedBackupDirectory(settings);
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

export function resolveBackupSettingsFileForTest() {
  return resolveBackupSettingsFilePath();
}
