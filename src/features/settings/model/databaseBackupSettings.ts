import {
  hasSettingsRuntimeRepository,
  loadDatabaseBackupSettingsFromRuntime,
  saveDatabaseBackupSettingsToRuntime,
  type RuntimeBackupSettings
} from '../../../shared/platform/settingsRuntimeRepository';

export type DatabaseBackupSettings = RuntimeBackupSettings;

const DEFAULT_BACKUP_SETTINGS: DatabaseBackupSettings = {
  schema_version: 3,
  defaults_version: 2,
  daily_max_count: 5,
  hourly_max_count: 8,
  monthly_max_count: 0,
  weekly_max_count: 1,
  backup_dir: '',
  extra_backup_dir: '',
  extra_backup_max_count: 10,
  retention_priority: ['daily', 'hourly', 'weekly', 'monthly'],
  safety_max_count: 2,
  total_size_limit_bytes: 2 * 1024 * 1024 * 1024,
  overridden_fields: [],
  updated_at: '1970-01-01T00:00:00.000Z'
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeDatabaseBackupSettings(value: unknown): DatabaseBackupSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_BACKUP_SETTINGS;
  }
  const payload = value as Record<string, unknown>;
  return {
    schema_version: 3,
    defaults_version: 2,
    daily_max_count: isFiniteNumber(payload.daily_max_count) ? Math.max(0, Math.round(payload.daily_max_count)) : 5,
    hourly_max_count: isFiniteNumber(payload.hourly_max_count) ? Math.max(0, Math.round(payload.hourly_max_count)) : 8,
    monthly_max_count: isFiniteNumber(payload.monthly_max_count) ? Math.max(0, Math.round(payload.monthly_max_count)) : 0,
    weekly_max_count: isFiniteNumber(payload.weekly_max_count) ? Math.max(0, Math.round(payload.weekly_max_count)) : 1,
    backup_dir: typeof payload.backup_dir === 'string' ? payload.backup_dir : '',
    extra_backup_dir: typeof payload.extra_backup_dir === 'string' ? payload.extra_backup_dir : '',
    extra_backup_max_count: isFiniteNumber(payload.extra_backup_max_count) ? Math.max(1, Math.round(payload.extra_backup_max_count)) : 10,
    retention_priority: normalizeRetentionPriority(payload.retention_priority),
    safety_max_count: isFiniteNumber(payload.safety_max_count) ? Math.max(1, Math.round(payload.safety_max_count)) : 2,
    total_size_limit_bytes:
      isFiniteNumber(payload.total_size_limit_bytes) ? Math.max(0, Math.round(payload.total_size_limit_bytes)) : DEFAULT_BACKUP_SETTINGS.total_size_limit_bytes,
    overridden_fields: normalizeOverrideFields(payload.overridden_fields),
    updated_at: typeof payload.updated_at === 'string' && payload.updated_at.trim().length > 0 ? payload.updated_at : DEFAULT_BACKUP_SETTINGS.updated_at
  };
}

function normalizeOverrideFields(value: unknown): DatabaseBackupSettings['overridden_fields'] {
  const allowed: DatabaseBackupSettings['overridden_fields'] = [
    'hourly', 'daily', 'weekly', 'monthly', 'backup_dir', 'extra_backup_dir',
    'extra_backup_max_count', 'retention_priority', 'safety_max_count', 'total_size_limit_bytes'
  ];
  if (!Array.isArray(value)) return [];
  return allowed.filter((field) => value.includes(field));
}

function normalizeRetentionPriority(value: unknown): DatabaseBackupSettings['retention_priority'] {
  const defaults = DEFAULT_BACKUP_SETTINGS.retention_priority;
  if (!Array.isArray(value)) return defaults;
  const result = value.filter((entry): entry is DatabaseBackupSettings['retention_priority'][number] =>
    typeof entry === 'string' && defaults.includes(entry as DatabaseBackupSettings['retention_priority'][number]));
  return result.length === defaults.length && new Set(result).size === defaults.length ? result : defaults;
}

export async function loadDatabaseBackupSettings(): Promise<DatabaseBackupSettings> {
  if (!hasSettingsRuntimeRepository()) {
    return DEFAULT_BACKUP_SETTINGS;
  }
  try {
    return normalizeDatabaseBackupSettings(await loadDatabaseBackupSettingsFromRuntime());
  } catch {
    return DEFAULT_BACKUP_SETTINGS;
  }
}

export async function saveDatabaseBackupSettings(settings: DatabaseBackupSettings): Promise<DatabaseBackupSettings> {
  if (!hasSettingsRuntimeRepository()) {
    return normalizeDatabaseBackupSettings(settings);
  }
  try {
    return normalizeDatabaseBackupSettings(
      await saveDatabaseBackupSettingsToRuntime(settings)
    );
  } catch {
    return normalizeDatabaseBackupSettings(settings);
  }
}
