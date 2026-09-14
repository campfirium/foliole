import { existsSync } from 'node:fs';
import path from 'node:path';

import { COMPRESSED_SQLITE_BACKUP_SUFFIX } from './compressedSqliteBackup.js';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function backupFileTimestamp(now: Date) {
  const date = `${pad(now.getFullYear() % 100)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}`;
}

function managedBackupStem(kind: 'auto' | 'manual' | 'rollback', now: Date, sequence = 1) {
  const collisionSuffix = sequence > 1 ? `-${sequence}` : '';
  return `foliole-${kind}-${backupFileTimestamp(now)}${collisionSuffix}`;
}

function availableManagedBackupPath(
  kind: 'manual' | 'rollback',
  now: Date,
  backupDirectory: string,
  compressed: boolean
) {
  for (let sequence = 1; sequence <= 1000; sequence += 1) {
    const stemPath = path.join(backupDirectory, managedBackupStem(kind, now, sequence));
    if (!existsSync(`${stemPath}.db`) && !existsSync(`${stemPath}${COMPRESSED_SQLITE_BACKUP_SUFFIX}`)) {
      return `${stemPath}${compressed ? COMPRESSED_SQLITE_BACKUP_SUFFIX : '.db'}`;
    }
  }
  throw new Error(`failed to allocate a unique ${kind} backup path`);
}

export function buildManagedBackupPath(now: Date, backupDirectory: string) {
  return availableManagedBackupPath('manual', now, backupDirectory, true);
}

export function buildRollbackBackupPath(now: Date, backupDirectory: string) {
  return availableManagedBackupPath('rollback', now, backupDirectory, false);
}

export function automaticBackupFileName(now: Date) {
  return `${managedBackupStem('auto', now)}${COMPRESSED_SQLITE_BACKUP_SUFFIX}`;
}
