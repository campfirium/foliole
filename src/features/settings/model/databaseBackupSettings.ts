import {
  hasSettingsRuntimeRepository,
  loadDatabaseBackupSettingsFromRuntime,
  saveDatabaseBackupSettingsToRuntime,
  type RuntimeBackupSettings
} from '../../../shared/platform/settingsRuntimeRepository';

export type DatabaseBackupSettings = RuntimeBackupSettings;

const DEFAULT_BACKUP_SETTINGS: DatabaseBackupSettings = {
  auto_daily_days: 7,
  auto_hourly_hours: 24,
  auto_monthly_months: 0,
  auto_weekly_weeks: 4,
  backup_dir: '',
  manual_max_count: 10,
  snapshot_max_count: 5,
  total_size_limit_bytes: 2 * 1024 * 1024 * 1024,
  updated_at: '1970-01-01T00:00:00.000Z'
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeDatabaseBackupSettings(value: unknown): DatabaseBackupSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_BACKUP_SETTINGS;
  }
  const payload = value as Record<string, unknown>;
  return {
    auto_daily_days: isFiniteNumber(payload.auto_daily_days) ? Math.max(0, Math.round(payload.auto_daily_days)) : 7,
    auto_hourly_hours: isFiniteNumber(payload.auto_hourly_hours) ? Math.max(0, Math.round(payload.auto_hourly_hours)) : 24,
    auto_monthly_months: isFiniteNumber(payload.auto_monthly_months) ? Math.max(0, Math.round(payload.auto_monthly_months)) : 0,
    auto_weekly_weeks: isFiniteNumber(payload.auto_weekly_weeks) ? Math.max(0, Math.round(payload.auto_weekly_weeks)) : 4,
    backup_dir: typeof payload.backup_dir === 'string' ? payload.backup_dir : '',
    manual_max_count: isFiniteNumber(payload.manual_max_count) ? Math.max(1, Math.round(payload.manual_max_count)) : 10,
    snapshot_max_count: isFiniteNumber(payload.snapshot_max_count) ? Math.max(1, Math.round(payload.snapshot_max_count)) : 5,
    total_size_limit_bytes:
      isFiniteNumber(payload.total_size_limit_bytes) ? Math.max(0, Math.round(payload.total_size_limit_bytes)) : DEFAULT_BACKUP_SETTINGS.total_size_limit_bytes,
    updated_at: typeof payload.updated_at === 'string' && payload.updated_at.trim().length > 0 ? payload.updated_at : DEFAULT_BACKUP_SETTINGS.updated_at
  };
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
