// @vitest-environment node

import { expect, it } from 'vitest';

import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';

import type { ApplicationDatabaseBackupEntry } from './backupCatalog.js';
import { frequencyBucketKey, selectAutomaticRestorePoints } from './backupRetentionPolicy.js';

const settings = {
  auto_daily_days: 2,
  auto_hourly_hours: 2,
  auto_monthly_months: 1,
  auto_weekly_weeks: 1
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

it('selects the latest point per bucket and reuses it across retention layers', () => {
  const older = entry('foliole-auto-backup-260713-081000.db', new Date(2026, 6, 13, 8, 10));
  const latest = entry('foliole-auto-backup-260713-084000.db', new Date(2026, 6, 13, 8, 40));
  const previousHour = entry('foliole-auto-backup-260713-074000.db', new Date(2026, 6, 13, 7, 40));

  const retained = selectAutomaticRestorePoints(
    [latest, older, previousHour],
    settings,
    new Date(2026, 6, 13, 8, 50)
  );

  expect([...retained]).toEqual([latest.filePath, previousHour.filePath]);
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
