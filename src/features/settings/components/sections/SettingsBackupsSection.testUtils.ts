import type { DatabaseBackupEntry } from '../../model/databaseBackups';

export const defaultSettings = {
  auto_daily_days: 7,
  auto_hourly_hours: 24,
  auto_monthly_months: 0,
  auto_weekly_weeks: 4,
  backup_dir: '/app/Backups',
  extra_backup_dir: '',
  extra_backup_max_count: 10,
  manual_max_count: 10,
  snapshot_max_count: 5,
  total_size_limit_bytes: 2 * 1024 * 1024 * 1024,
  updated_at: '2026-04-02T10:00:00.000Z'
};

export const defaultBackups = [
  backupEntry('auto-daily-2026-04-02_08-00-00-000.db', '2026-04-02T08:00:00.000Z', {
    autoFrequency: 'daily',
    kind: 'automatic',
    sizeBytes: 6 * 1024 * 1024
  })
];

export function backupEntry(
  fileName: string,
  updatedAt: string,
  overrides: Partial<DatabaseBackupEntry> = {}
): DatabaseBackupEntry {
  return {
    autoFrequency: null,
    fileName,
    filePath: `/app/Backups/${fileName}`,
    kind: 'manual',
    snapshotReason: null,
    sizeBytes: 5 * 1024 * 1024,
    updatedAt,
    ...overrides
  };
}
