import fs from 'node:fs';
import path from 'node:path';

import { normalizeLibraryPath } from '../../lib/platform/libraryPaths.js';
import type {
  NativeBackupRetentionTier,
  NativeBackupSettings
} from '../../lib/platform/nativeUtilityContract.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

const BACKUP_SETTINGS_KEY = 'backup_settings';
const DEFAULT_UPDATED_AT = '1970-01-01T00:00:00.000Z';
const GIGABYTE_BYTES = 1024 * 1024 * 1024;
const RETENTION_TIERS: NativeBackupRetentionTier[] = ['hourly', 'daily', 'weekly', 'monthly'];

interface StoredBackupSettings {
  schema_version?: unknown;
  daily_max_count?: unknown;
  hourly_max_count?: unknown;
  monthly_max_count?: unknown;
  weekly_max_count?: unknown;
  backup_dir?: unknown;
  extra_backup_dir?: unknown;
  extra_backup_max_count?: unknown;
  retention_priority?: unknown;
  manual_max_count?: unknown;
  safety_max_count?: unknown;
  auto_daily_days?: unknown;
  auto_hourly_hours?: unknown;
  auto_monthly_months?: unknown;
  auto_weekly_weeks?: unknown;
  snapshot_max_count?: unknown;
  total_size_limit_bytes?: unknown;
  updated_at?: unknown;
}

const DEFAULT_BACKUP_SETTINGS: NativeBackupSettings = {
  schema_version: 2,
  daily_max_count: 5,
  hourly_max_count: 8,
  monthly_max_count: 0,
  weekly_max_count: 1,
  backup_dir: '',
  extra_backup_dir: '',
  extra_backup_max_count: 10,
  retention_priority: [...RETENTION_TIERS],
  safety_max_count: 2,
  total_size_limit_bytes: 2 * GIGABYTE_BYTES,
  updated_at: DEFAULT_UPDATED_AT
};

function readStoredBackupSettings() {
  return loadJsonSetting(BACKUP_SETTINGS_KEY);
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.round(value));
}

function normalizeRetentionPriority(value: unknown) {
  if (!Array.isArray(value)) return [...RETENTION_TIERS];
  const result = value.filter((entry): entry is NativeBackupRetentionTier =>
    typeof entry === 'string' && RETENTION_TIERS.includes(entry as NativeBackupRetentionTier));
  return result.length === RETENTION_TIERS.length && new Set(result).size === RETENTION_TIERS.length
    ? result
    : [...RETENTION_TIERS];
}

function legacyValue(value: StoredBackupSettings, currentKey: keyof StoredBackupSettings, legacyKey: keyof StoredBackupSettings) {
  return value[currentKey] ?? value[legacyKey];
}

export function normalizeBackupSettings(payload: unknown): NativeBackupSettings {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ...DEFAULT_BACKUP_SETTINGS, retention_priority: [...RETENTION_TIERS] };
  }
  const value = payload as StoredBackupSettings;
  return {
    schema_version: 2,
    daily_max_count: normalizePositiveInteger(
      legacyValue(value, 'daily_max_count', 'auto_daily_days'),
      DEFAULT_BACKUP_SETTINGS.daily_max_count
    ),
    hourly_max_count: normalizePositiveInteger(
      legacyValue(value, 'hourly_max_count', 'auto_hourly_hours'),
      DEFAULT_BACKUP_SETTINGS.hourly_max_count
    ),
    monthly_max_count: normalizePositiveInteger(
      legacyValue(value, 'monthly_max_count', 'auto_monthly_months'),
      DEFAULT_BACKUP_SETTINGS.monthly_max_count
    ),
    weekly_max_count: normalizePositiveInteger(
      legacyValue(value, 'weekly_max_count', 'auto_weekly_weeks'),
      DEFAULT_BACKUP_SETTINGS.weekly_max_count
    ),
    backup_dir: normalizeLibraryPath(value.backup_dir) ?? '',
    extra_backup_dir: normalizeLibraryPath(value.extra_backup_dir) ?? '',
    extra_backup_max_count: Math.max(
      1,
      normalizePositiveInteger(
        value.extra_backup_max_count,
        DEFAULT_BACKUP_SETTINGS.extra_backup_max_count
      )
    ),
    retention_priority: normalizeRetentionPriority(value.retention_priority),
    safety_max_count: Math.max(
      1,
      normalizePositiveInteger(
        legacyValue(value, 'safety_max_count', 'snapshot_max_count'),
        DEFAULT_BACKUP_SETTINGS.safety_max_count
      )
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
  saveJsonSetting(BACKUP_SETTINGS_KEY, settings, settings.updated_at);
}

export function loadBackupSettings(): NativeBackupSettings {
  const stored = readStoredBackupSettings();
  const normalized = normalizeBackupSettings(stored);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored) ||
      (stored as StoredBackupSettings).schema_version !== 2) {
    saveStoredBackupSettings(normalized);
  }
  return normalized;
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

export function resolveManagedBackupDirectory(
  settings = normalizeBackupSettings(readStoredBackupSettings())
) {
  if (settings.backup_dir) {
    return settings.backup_dir;
  }
  return path.join(loadLibraryPathSettingsSync().library_home, 'Backups');
}

export function ensureManagedBackupDirectory(settings?: NativeBackupSettings) {
  const directoryPath = resolveManagedBackupDirectory(settings);
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}
