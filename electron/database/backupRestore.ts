import { closeDatabaseConnection, openDatabaseConnection, resolveDatabasePath } from './connection.js';
import { initializeDatabase } from './migrate.js';
import {
  backupSqliteDatabase,
  restoreSqliteDatabase,
  type SqliteBackupResult,
  type SqliteRestoreResult
} from './sqliteBackupRestore.js';

export interface CreateApplicationDatabaseBackupOptions {
  destinationPath?: string;
}

export interface RestoreApplicationDatabaseBackupOptions {
  sourcePath: string;
}

export async function createApplicationDatabaseBackup(
  options: CreateApplicationDatabaseBackupOptions = {}
): Promise<SqliteBackupResult> {
  const connection = initializeDatabase();
  return backupSqliteDatabase({
    sourcePath: connection.dbPath,
    destinationPath: options.destinationPath,
    sourceDatabase: connection.sqlite
  });
}

export async function restoreApplicationDatabaseBackup(
  options: RestoreApplicationDatabaseBackupOptions
): Promise<SqliteRestoreResult> {
  const targetPath = resolveDatabasePath();
  closeDatabaseConnection();
  const result = await restoreSqliteDatabase({ sourcePath: options.sourcePath, targetPath });
  initializeDatabase();
  return result;
}

export function getApplicationDatabasePath() {
  return openDatabaseConnection().dbPath;
}
