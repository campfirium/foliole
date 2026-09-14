// @vitest-environment node

import { expect, it } from 'vitest';

import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';

import type { ApplicationDatabaseBackupEntry } from './backupCatalog.js';
import { frequencyBucketKey, selectOrdinaryRestorePoints } from './backupRetentionPolicy.js';

const settings = {
  daily_max_count: 2,
  hourly_max_count: 2,
  monthly_max_count: 1,
  retention_priority: ['hourly', 'daily', 'weekly', 'monthly'],
  schema_version: 2,
  weekly_max_count: 1
} as NativeBackupSettings;

function entry(fileName: string, date: Date): ApplicationDatabaseBackupEntry {
  return {
    autoFrequency: null,
    fileName,
    filePath: `/backups/${fileName}`,
    kind: 'automatic',
    sizeBytes: 1,
    snapshotReason: null,
    updatedAt: date.toISOString()
  };
}

it('selects each tier independently and lets one file satisfy multiple tiers', () => {
  const older = entry('foliole-auto-backup-260713-081000.db', new Date(2026, 6, 13, 8, 10));
  const latest = entry('foliole-auto-backup-260713-084000.db', new Date(2026, 6, 13, 8, 40));
  const previousHour = entry('foliole-auto-backup-260713-074000.db', new Date(2026, 6, 13, 7, 40));
  const previousDay = entry('manual-2026-07-12_07-40-00-000.db', new Date(2026, 6, 12, 7, 40));

  previousDay.kind = 'manual';
  const retained = selectOrdinaryRestorePoints([latest, older, previousHour, previousDay], settings);

  expect(retained.hourly.map((item) => item.filePath)).toEqual([
    latest.filePath,
    previousHour.filePath
  ]);
  expect(retained.daily.map((item) => item.filePath)).toEqual([latest.filePath, previousDay.filePath]);
  expect(retained.weekly.map((item) => item.filePath)).toEqual([latest.filePath]);
  expect(retained.monthly.map((item) => item.filePath)).toEqual([latest.filePath]);
  expect(Object.values(retained).flat()).not.toContain(older);
});

it('counts only natural buckets that contain restore points', () => {
  const currentWeek = entry('current.db', new Date(2026, 6, 13, 8, 10));
  const oldWeek = entry('old.db', new Date(2026, 5, 1, 8, 10));
  const retained = selectOrdinaryRestorePoints([currentWeek, oldWeek], {
    ...settings,
    daily_max_count: 0,
    hourly_max_count: 0,
    monthly_max_count: 0,
    weekly_max_count: 2
  });

  expect(retained.weekly.map((item) => item.filePath)).toEqual([
    currentWeek.filePath,
    oldWeek.filePath
  ]);
});

it('uses Monday as the start of a local week', () => {
  const sunday = new Date(2026, 6, 12, 12, 0);
  const monday = new Date(2026, 6, 13, 12, 0);

  expect(frequencyBucketKey(sunday, 'weekly')).not.toBe(frequencyBucketKey(monday, 'weekly'));
  expect(frequencyBucketKey(monday, 'weekly')).toBe(
    frequencyBucketKey(new Date(2026, 6, 19, 23, 59), 'weekly')
  );
});

it('separates local day and month boundaries', () => {
  expect(frequencyBucketKey(new Date(2026, 5, 30, 23, 59), 'daily')).not.toBe(
    frequencyBucketKey(new Date(2026, 6, 1, 0, 1), 'daily')
  );
  expect(frequencyBucketKey(new Date(2026, 5, 30, 23, 59), 'monthly')).not.toBe(
    frequencyBucketKey(new Date(2026, 6, 1, 0, 1), 'monthly')
  );
});
