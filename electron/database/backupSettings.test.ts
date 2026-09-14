// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));

vi.mock('./settingsStore.js', () => ({
  loadJsonSetting: store.load,
  saveJsonSetting: store.save
}));
vi.mock('../ipc/libraryPaths.js', () => ({
  loadLibraryPathSettingsSync: () => ({ library_home: '/Library' })
}));

import { loadBackupSettings, normalizeBackupSettings, saveBackupSettings } from './backupSettings.js';

beforeEach(() => {
  vi.clearAllMocks();
});

it('uses compact count defaults for a new installation', () => {
  expect(normalizeBackupSettings(null)).toMatchObject({
    defaults_version: 2,
    daily_max_count: 5,
    hourly_max_count: 8,
    monthly_max_count: 0,
    overridden_fields: [],
    retention_priority: ['daily', 'hourly', 'weekly', 'monthly'],
    safety_max_count: 2,
    schema_version: 3,
    weekly_max_count: 1
  });
});

it('uses the current count defaults when legacy time-window rules changed meaning', () => {
  store.load.mockReturnValue({
    auto_daily_days: 7,
    auto_hourly_hours: 24,
    auto_monthly_months: 0,
    auto_weekly_weeks: 4,
    backup_dir: '/Custom Backups',
    manual_max_count: 20,
    snapshot_max_count: 5,
    updated_at: '2026-09-13T00:00:00.000Z'
  });

  const settings = loadBackupSettings();

  expect(settings).toMatchObject({
    backup_dir: '/Custom Backups',
    daily_max_count: 5,
    hourly_max_count: 8,
    monthly_max_count: 0,
    overridden_fields: ['backup_dir'],
    safety_max_count: 2,
    schema_version: 3,
    weekly_max_count: 1
  });
  expect(settings).not.toHaveProperty('manual_max_count');
  expect(store.save).toHaveBeenCalledTimes(1);
  expect(store.save).toHaveBeenCalledWith('backup_settings', settings, settings.updated_at);
});

it('preserves only same-meaning legacy values that differ from their old defaults', () => {
  const settings = normalizeBackupSettings({
    extra_backup_max_count: 3,
    snapshot_max_count: 4,
    total_size_limit_bytes: 1024
  });

  expect(settings).toMatchObject({
    extra_backup_max_count: 3,
    safety_max_count: 4,
    total_size_limit_bytes: 1024,
    overridden_fields: ['extra_backup_max_count', 'safety_max_count', 'total_size_limit_bytes']
  });
});

it('repairs provenance-less v2 settings without treating migrated counts as overrides', () => {
  const settings = normalizeBackupSettings({
    schema_version: 2,
    hourly_max_count: 24,
    daily_max_count: 7,
    weekly_max_count: 4,
    monthly_max_count: 0,
    backup_dir: '/Custom Backups',
    retention_priority: ['weekly', 'hourly', 'daily', 'monthly']
  });

  expect(settings).toMatchObject({
    hourly_max_count: 8,
    daily_max_count: 5,
    weekly_max_count: 1,
    monthly_max_count: 0,
    overridden_fields: ['backup_dir', 'retention_priority'],
    retention_priority: ['weekly', 'hourly', 'daily', 'monthly']
  });
});

it('applies current defaults to unoverridden fields in a versioned setting', () => {
  const settings = normalizeBackupSettings({
    schema_version: 3,
    defaults_version: 1,
    hourly_max_count: 99,
    daily_max_count: 3,
    retention_priority: ['hourly', 'daily', 'weekly', 'monthly'],
    overridden_fields: ['daily']
  });

  expect(settings).toMatchObject({
    defaults_version: 2,
    hourly_max_count: 8,
    daily_max_count: 3,
    overridden_fields: ['daily'],
    retention_priority: ['daily', 'hourly', 'weekly', 'monthly']
  });
});

it('marks changed fields as overrides and clears them when restored to the current default', () => {
  const current = normalizeBackupSettings(null);
  store.load.mockReturnValue(current);

  const customized = saveBackupSettings({ hourly_max_count: 12 });
  expect(customized.hourly_max_count).toBe(12);
  expect(customized.overridden_fields).toEqual(['hourly']);

  store.load.mockReturnValue(customized);
  const restored = saveBackupSettings({ hourly_max_count: 8 });
  expect(restored.hourly_max_count).toBe(8);
  expect(restored.overridden_fields).toEqual([]);
});
