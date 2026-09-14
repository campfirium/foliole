import type {
  NativeBackupRetentionTier,
  NativeBackupSettings
} from '../../lib/platform/nativeUtilityContract.js';

import type { ApplicationDatabaseBackupEntry } from './backupCatalog.js';

export const BACKUP_RETENTION_TIERS: NativeBackupRetentionTier[] = [
  'hourly',
  'daily',
  'weekly',
  'monthly'
];

export type RestorePointsByTier = Record<NativeBackupRetentionTier, ApplicationDatabaseBackupEntry[]>;

function startOfLocalHour(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime();
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function startOfLocalWeek(date: Date) {
  const dayStart = new Date(startOfLocalDay(date));
  dayStart.setDate(dayStart.getDate() - ((dayStart.getDay() + 6) % 7));
  return dayStart.getTime();
}

function bucketStart(date: Date, tier: NativeBackupRetentionTier) {
  if (tier === 'hourly') return startOfLocalHour(date);
  if (tier === 'daily') return startOfLocalDay(date);
  if (tier === 'weekly') return startOfLocalWeek(date);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

export function retentionLimit(settings: NativeBackupSettings, tier: NativeBackupRetentionTier) {
  if (tier === 'hourly') return settings.hourly_max_count;
  if (tier === 'daily') return settings.daily_max_count;
  if (tier === 'weekly') return settings.weekly_max_count;
  return settings.monthly_max_count;
}

export function finestEnabledFrequency(settings: NativeBackupSettings) {
  return BACKUP_RETENTION_TIERS.find((tier) => retentionLimit(settings, tier) > 0) ?? null;
}

export function frequencyBucketKey(date: Date, tier: NativeBackupRetentionTier) {
  return `${tier}:${bucketStart(date, tier)}`;
}

export function selectOrdinaryRestorePoints(
  entries: ApplicationDatabaseBackupEntry[],
  settings: NativeBackupSettings
): RestorePointsByTier {
  const selected: RestorePointsByTier = { hourly: [], daily: [], weekly: [], monthly: [] };
  const newestFirst = [...entries].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  for (const tier of BACKUP_RETENTION_TIERS) {
    const limit = retentionLimit(settings, tier);
    if (limit <= 0) continue;
    const coveredBuckets = new Set<string>();
    for (const entry of newestFirst) {
      if (selected[tier].length >= limit) break;
      const bucket = frequencyBucketKey(new Date(entry.updatedAt), tier);
      if (coveredBuckets.has(bucket)) continue;
      coveredBuckets.add(bucket);
      selected[tier].push(entry);
    }
  }
  return selected;
}
