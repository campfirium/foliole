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

import { loadBackupSettings, normalizeBackupSettings } from './backupSettings.js';

beforeEach(() => {
  vi.clearAllMocks();
});

it('uses compact count defaults for a new installation', () => {
  expect(normalizeBackupSettings(null)).toMatchObject({
    daily_max_count: 5,
    hourly_max_count: 8,
    monthly_max_count: 0,
    retention_priority: ['hourly', 'daily', 'weekly', 'monthly'],
    safety_max_count: 2,
    schema_version: 2,
    weekly_max_count: 1
  });
});

it('migrates legacy windows once and drops the independent manual slot count', () => {
  store.load.mockReturnValue({
    auto_daily_days: 9,
    auto_hourly_hours: 12,
    auto_monthly_months: 2,
    auto_weekly_weeks: 3,
    manual_max_count: 20,
    snapshot_max_count: 4,
    updated_at: '2026-09-13T00:00:00.000Z'
  });

  const settings = loadBackupSettings();

  expect(settings).toMatchObject({
    daily_max_count: 9,
    hourly_max_count: 12,
    monthly_max_count: 2,
    safety_max_count: 4,
    schema_version: 2,
    weekly_max_count: 3
  });
  expect(settings).not.toHaveProperty('manual_max_count');
  expect(store.save).toHaveBeenCalledTimes(1);
  expect(store.save).toHaveBeenCalledWith('backup_settings', settings, settings.updated_at);
});
