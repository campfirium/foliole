import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';

export interface ApplicationDatabaseBackupEntry {
  fileName: string;
  filePath: string;
  kind: 'manual' | 'automatic' | 'snapshot';
  autoFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | null;
  snapshotReason: 'pre-migration' | 'pre-restore' | null;
  sizeBytes: number;
  updatedAt: string;
}

const AUTO_FILE_PATTERN =
  /^auto-(hourly|daily|weekly|monthly)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.db$/;
const SNAPSHOT_FILE_PATTERN =
  /^(pre-migration|pre-restore)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.db$/;
const MANUAL_FILE_PATTERN =
  /^(?:manual|foliole)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.db$/;

function parseEntryFromFileName(fileName: string): Pick<
  ApplicationDatabaseBackupEntry,
  'autoFrequency' | 'kind' | 'snapshotReason'
> | null {
  const autoMatch = fileName.match(AUTO_FILE_PATTERN);
  if (autoMatch) {
    return {
      autoFrequency: autoMatch[1] as ApplicationDatabaseBackupEntry['autoFrequency'],
      kind: 'automatic',
      snapshotReason: null
    };
  }
  const snapshotMatch = fileName.match(SNAPSHOT_FILE_PATTERN);
  if (snapshotMatch) {
    return {
      autoFrequency: null,
      kind: 'snapshot',
      snapshotReason: snapshotMatch[1] as ApplicationDatabaseBackupEntry['snapshotReason']
    };
  }
  if (MANUAL_FILE_PATTERN.test(fileName)) {
    return {
      autoFrequency: null,
      kind: 'manual',
      snapshotReason: null
    };
  }
  return null;
}

function startOfUtcHour(date: Date) {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours()
  );
}

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfUtcWeek(date: Date) {
  const day = date.getUTCDay();
  const distance = (day + 6) % 7;
  return startOfUtcDay(new Date(startOfUtcDay(date) - distance * 24 * 60 * 60 * 1000));
}

function startOfUtcMonth(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function getAutoRetentionDistance(now: Date, entryDate: Date, frequency: NonNullable<ApplicationDatabaseBackupEntry['autoFrequency']>) {
  if (frequency === 'hourly') {
    return Math.floor((startOfUtcHour(now) - startOfUtcHour(entryDate)) / (60 * 60 * 1000));
  }
  if (frequency === 'daily') {
    return Math.floor((startOfUtcDay(now) - startOfUtcDay(entryDate)) / (24 * 60 * 60 * 1000));
  }
  if (frequency === 'weekly') {
    return Math.floor((startOfUtcWeek(now) - startOfUtcWeek(entryDate)) / (7 * 24 * 60 * 60 * 1000));
  }
  return (
    (now.getUTCFullYear() - entryDate.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - entryDate.getUTCMonth())
  );
}

function getAutoBucketKey(entryDate: Date, frequency: NonNullable<ApplicationDatabaseBackupEntry['autoFrequency']>) {
  if (frequency === 'hourly') {
    return new Date(startOfUtcHour(entryDate)).toISOString();
  }
  if (frequency === 'daily') {
    return new Date(startOfUtcDay(entryDate)).toISOString();
  }
  if (frequency === 'weekly') {
    return new Date(startOfUtcWeek(entryDate)).toISOString();
  }
  return new Date(startOfUtcMonth(entryDate)).toISOString();
}

function shouldKeepAutomaticEntry(entry: ApplicationDatabaseBackupEntry, settings: NativeBackupSettings, now: Date) {
  if (!entry.autoFrequency) {
    return false;
  }
  const retentionLimit =
    entry.autoFrequency === 'hourly'
      ? settings.auto_hourly_hours
      : entry.autoFrequency === 'daily'
        ? settings.auto_daily_days
        : entry.autoFrequency === 'weekly'
          ? settings.auto_weekly_weeks
          : settings.auto_monthly_months;
  if (retentionLimit <= 0) {
    return false;
  }
  return getAutoRetentionDistance(now, new Date(entry.updatedAt), entry.autoFrequency) < retentionLimit;
}

async function readBackupDirectory(directoryPath: string) {
  let fileNames: string[];
  try {
    fileNames = await fs.readdir(directoryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [] as ApplicationDatabaseBackupEntry[];
    }
    throw error;
  }

  const entries = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith('.db'))
      .map(async (fileName) => {
        const parsed = parseEntryFromFileName(fileName);
        if (!parsed) {
          return null;
        }
        const filePath = path.join(directoryPath, fileName);
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
          return null;
        }
        return {
          fileName,
          filePath,
          kind: parsed.kind,
          autoFrequency: parsed.autoFrequency,
          snapshotReason: parsed.snapshotReason,
          sizeBytes: stats.size,
          updatedAt: stats.mtime.toISOString()
        } satisfies ApplicationDatabaseBackupEntry;
      })
  );

  return entries
    .filter((entry): entry is ApplicationDatabaseBackupEntry => entry !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function listManagedDatabaseBackups(directoryPath: string) {
  return readBackupDirectory(directoryPath);
}

export async function pruneManagedDatabaseBackups(directoryPath: string, settings: NativeBackupSettings, now = new Date()) {
  const entries = await readBackupDirectory(directoryPath);
  const retained = new Set<string>();

  const manualEntries = entries.filter((entry) => entry.kind === 'manual').slice(0, settings.manual_max_count);
  manualEntries.forEach((entry) => retained.add(entry.filePath));

  const snapshotEntries = entries.filter((entry) => entry.kind === 'snapshot').slice(0, settings.snapshot_max_count);
  snapshotEntries.forEach((entry) => retained.add(entry.filePath));

  const autoEntries = entries.filter((entry) => entry.kind === 'automatic' && shouldKeepAutomaticEntry(entry, settings, now));
  const seenAutoBuckets = new Set<string>();
  for (const entry of autoEntries) {
    const bucketKey = getAutoBucketKey(new Date(entry.updatedAt), entry.autoFrequency!);
    const dedupeKey = `${entry.autoFrequency}:${bucketKey}`;
    if (seenAutoBuckets.has(dedupeKey)) {
      continue;
    }
    seenAutoBuckets.add(dedupeKey);
    retained.add(entry.filePath);
  }

  const retainedEntries = entries.filter((entry) => retained.has(entry.filePath));
  let totalSizeBytes = retainedEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (settings.total_size_limit_bytes > 0 && totalSizeBytes > settings.total_size_limit_bytes) {
    const oldestFirst = [...retainedEntries].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    for (const entry of oldestFirst) {
      if (totalSizeBytes <= settings.total_size_limit_bytes) {
        break;
      }
      retained.delete(entry.filePath);
      totalSizeBytes -= entry.sizeBytes;
    }
  }

  const deletedPaths = entries
    .filter((entry) => !retained.has(entry.filePath))
    .map((entry) => entry.filePath);
  await Promise.all(deletedPaths.map((filePath) => fs.rm(filePath, { force: true })));
}
