import fs from 'node:fs';
import path from 'node:path';

import { normalizeLibraryPath } from '../../lib/platform/libraryPaths.js';
import type {
  NativeBackupSettingOverride,
  NativeBackupSettings
} from '../../lib/platform/nativeUtilityContract.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import {
  DEFAULT_BACKUP_SETTINGS,
  LEGACY_DEFAULTS,
  normalizeOverrideFields,
  normalizeRetentionPriority,
  sameSettingValue,
  SETTING_FIELDS,
  settingValue,
  withCurrentDefaults
} from './backupSettingsDefaults.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

const BACKUP_SETTINGS_KEY = 'backup_settings';

interface StoredBackupSettings {
  schema_version?: unknown;
  defaults_version?: unknown;
  overridden_fields?: unknown;
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

function readStoredBackupSettings() {
  return loadJsonSetting(BACKUP_SETTINGS_KEY);
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.round(value));
}

function inferLegacyOverrides(value: StoredBackupSettings) {
  const overrides: NativeBackupSettingOverride[] = [];
  if (normalizeLibraryPath(value.backup_dir)) overrides.push('backup_dir');
  if (normalizeLibraryPath(value.extra_backup_dir)) overrides.push('extra_backup_dir');
  if (typeof value.extra_backup_max_count === 'number' && value.extra_backup_max_count !== LEGACY_DEFAULTS.extra_backup_max_count) overrides.push('extra_backup_max_count');
  const safety = legacyValue(value, 'safety_max_count', 'snapshot_max_count');
  if (typeof safety === 'number' && safety !== LEGACY_DEFAULTS.safety_max_count && safety !== DEFAULT_BACKUP_SETTINGS.safety_max_count) overrides.push('safety_max_count');
  if (typeof value.total_size_limit_bytes === 'number' && value.total_size_limit_bytes !== LEGACY_DEFAULTS.total_size_limit_bytes) overrides.push('total_size_limit_bytes');
  if (value.schema_version === 2 && !sameSettingValue(normalizeRetentionPriority(value.retention_priority), DEFAULT_BACKUP_SETTINGS.retention_priority)) overrides.push('retention_priority');
  return overrides;
}

function legacyValue(value: StoredBackupSettings, currentKey: keyof StoredBackupSettings, legacyKey: keyof StoredBackupSettings) {
  return value[currentKey] ?? value[legacyKey];
}

export function normalizeBackupSettings(payload: unknown): NativeBackupSettings {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ...DEFAULT_BACKUP_SETTINGS, retention_priority: [...DEFAULT_BACKUP_SETTINGS.retention_priority], overridden_fields: [] };
  }
  const value = payload as StoredBackupSettings;
  const normalized: NativeBackupSettings = {
    schema_version: 3,
    defaults_version: 2,
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
    overridden_fields: [],
    updated_at:
      typeof value.updated_at === 'string' && value.updated_at.trim().length > 0
        ? value.updated_at
        : DEFAULT_BACKUP_SETTINGS.updated_at
  };
  const overrides = value.schema_version === 3
    ? normalizeOverrideFields(value.overridden_fields)
    : inferLegacyOverrides(value);
  normalized.overridden_fields = overrides;
  return withCurrentDefaults(normalized, overrides);
}

function saveStoredBackupSettings(settings: NativeBackupSettings) {
  saveJsonSetting(BACKUP_SETTINGS_KEY, settings, settings.updated_at);
}

export function loadBackupSettings(): NativeBackupSettings {
  const stored = readStoredBackupSettings();
  const normalized = normalizeBackupSettings(stored);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored) ||
      (stored as StoredBackupSettings).schema_version !== 3 ||
      (stored as StoredBackupSettings).defaults_version !== DEFAULT_BACKUP_SETTINGS.defaults_version) {
    saveStoredBackupSettings(normalized);
  }
  return normalized;
}

export function saveBackupSettings(
  settings: Partial<NativeBackupSettings> & { updated_at?: string }
): NativeBackupSettings {
  const current = loadBackupSettings();
  const incoming = normalizeBackupSettings({
    ...current,
    ...settings,
    overridden_fields: SETTING_FIELDS,
    updated_at: settings.updated_at ?? new Date().toISOString()
  });
  const overrides = new Set(current.overridden_fields);
  for (const field of SETTING_FIELDS) {
    const nextValue = settingValue(incoming, field);
    if (sameSettingValue(nextValue, settingValue(current, field))) continue;
    if (sameSettingValue(nextValue, settingValue(DEFAULT_BACKUP_SETTINGS, field))) overrides.delete(field);
    else overrides.add(field);
  }
  const normalized = withCurrentDefaults(incoming, [...overrides]);
  normalized.overridden_fields = [...overrides];
  saveStoredBackupSettings(normalized);
  return normalized;
}

export function reapplyBackupSettingsAfterRestore(
  settings: NativeBackupSettings,
  updatedAt = new Date().toISOString()
) {
  const reapplied = {
    ...settings,
    overridden_fields: [...settings.overridden_fields],
    retention_priority: [...settings.retention_priority],
    updated_at: updatedAt
  };
  saveStoredBackupSettings(reapplied);
  return reapplied;
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
