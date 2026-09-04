import { promises as fs } from 'node:fs';
import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';

export function assertSqliteIntegrity(sqlite: BetterSqlite3.Database) {
  const integrityRows = sqlite.pragma('integrity_check') as Array<{ integrity_check: string }>;
  const foreignKeys = sqlite.pragma('foreign_key_check') as unknown[];
  if (integrityRows.length !== 1 || integrityRows[0]?.integrity_check !== 'ok' || foreignKeys.length > 0) {
    throw new Error(`database_integrity_failed:${JSON.stringify({ foreignKeys, integrityRows })}`);
  }
  return { foreignKeyViolations: 0, integrityCheck: 'ok' as const };
}

export async function createVerifiedSqliteBackup(input: {
  dbPath: string;
  name: string;
  openReadonly: (backupPath: string) => BetterSqlite3.Database;
  sqlite: BetterSqlite3.Database;
  stamp: string;
}) {
  const backupDir = path.join(path.dirname(path.dirname(input.dbPath)), 'Backups');
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${input.name}-${input.stamp.replaceAll(':', '-')}.db`);
  await input.sqlite.backup(backupPath);
  const backup = input.openReadonly(backupPath);
  try {
    assertSqliteIntegrity(backup);
  } finally {
    backup.close();
  }
  return backupPath;
}
