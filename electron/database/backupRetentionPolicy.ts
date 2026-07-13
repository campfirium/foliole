import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';

import type { ApplicationDatabaseBackupEntry } from './backupCatalog.js';

export const AUTO_FREQUENCIES = ['hourly', 'daily', 'weekly', 'monthly'] as const;
export type AutoFrequency = (typeof AUTO_FREQUENCIES)[number];

function startOfLocalHour(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime();
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function startOfLocalWeek(date: Date) {
  const dayStart = new Date(startOfLocalDay(date));
  const distance = (dayStart.getDay() + 6) % 7;
  dayStart.setDate(dayStart.getDate() - distance);
  return dayStart.getTime();
}

function startOfLocalMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function bucketStart(date: Date, frequency: AutoFrequency) {
  if (frequency === 'hourly') return startOfLocalHour(date);
  if (frequency === 'daily') return startOfLocalDay(date);
  if (frequency === 'weekly') return startOfLocalWeek(date);
  return startOfLocalMonth(date);
}

function calendarDistance(now: Date, entryDate: Date, frequency: AutoFrequency) {
  if (frequency === 'hourly') {
    return Math.round((startOfLocalHour(now) - startOfLocalHour(entryDate)) / (60 * 60 * 1000));
  }
  if (frequency === 'daily') {
    return Math.round((startOfLocalDay(now) - startOfLocalDay(entryDate)) / (24 * 60 * 60 * 1000));
  }
  if (frequency === 'weekly') {
    return Math.round((startOfLocalWeek(now) - startOfLocalWeek(entryDate)) / (7 * 24 * 60 * 60 * 1000));
  }
  return (now.getFullYear() - entryDate.getFullYear()) * 12 + now.getMonth() - entryDate.getMonth();
}

export function retentionLimit(settings: NativeBackupSettings, frequency: AutoFrequency) {
  if (frequency === 'hourly') return settings.auto_hourly_hours;
  if (frequency === 'daily') return settings.auto_daily_days;
  if (frequency === 'weekly') return settings.auto_weekly_weeks;
  return settings.auto_monthly_months;
}

export function finestEnabledFrequency(settings: NativeBackupSettings) {
  return AUTO_FREQUENCIES.find((frequency) => retentionLimit(settings, frequency) > 0) ?? null;
}

export function frequencyBucketKey(date: Date, frequency: AutoFrequency) {
  return `${frequency}:${bucketStart(date, frequency)}`;
}

export function selectAutomaticRestorePoints(
  entries: ApplicationDatabaseBackupEntry[],
  settings: NativeBackupSettings,
  now: Date
) {
  const retained = new Set<string>();
  for (const frequency of AUTO_FREQUENCIES) {
    const limit = retentionLimit(settings, frequency);
    if (limit <= 0) continue;
    const seenBuckets = new Set<string>();
    for (const entry of entries) {
      const entryDate = new Date(entry.updatedAt);
      const distance = calendarDistance(now, entryDate, frequency);
      if (distance < 0 || distance >= limit) continue;
      const bucketKey = frequencyBucketKey(entryDate, frequency);
      if (seenBuckets.has(bucketKey)) continue;
      seenBuckets.add(bucketKey);
      retained.add(entry.filePath);
    }
  }
  return retained;
}
