import path from 'node:path';

import { COMPRESSED_SQLITE_BACKUP_SUFFIX } from './compressedSqliteBackup.js';

function backupFileTimestamp(now: Date) {
  return now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function buildManagedBackupPath(prefix: string, now: Date, backupDirectory: string) {
  return path.join(backupDirectory, `${prefix}-${backupFileTimestamp(now)}${COMPRESSED_SQLITE_BACKUP_SUFFIX}`);
}

export function automaticBackupFileName(now: Date) {
  const date = `${pad(now.getFullYear() % 100)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `foliole-auto-backup-${date}-${time}${COMPRESSED_SQLITE_BACKUP_SUFFIX}`;
}
