import { promises as fs } from 'node:fs';
import path from 'node:path';

import { closeDatabaseConnection, openDatabaseConnection, resolveDatabasePath } from './connection.js';
import { createInternalDatabaseSnapshot } from './internalSnapshots.js';
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

export interface ApplicationDatabaseBackupEntry {
  fileName: string;
  filePath: string;
  kind: 'backup' | 'snapshot';
  snapshotReason: 'pre-migration' | 'pre-restore' | null;
  sizeBytes: number;
  updatedAt: string;
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
  const connection = openDatabaseConnection();
  const targetPath = connection.dbPath;
  createInternalDatabaseSnapshot({
    reason: 'pre-restore',
    sourceDatabase: connection.sqlite,
    sourcePath: targetPath
  });
  closeDatabaseConnection();
  const result = await restoreSqliteDatabase({ sourcePath: options.sourcePath, targetPath });
  initializeDatabase();
  return result;
}

export async function listApplicationDatabaseBackups(): Promise<ApplicationDatabaseBackupEntry[]> {
  const databaseDirectoryPath = path.dirname(resolveDatabasePath());
  const [backupEntries, snapshotEntries] = await Promise.all([
    listDatabaseFiles(path.join(databaseDirectoryPath, 'backups'), 'backup'),
    listDatabaseFiles(path.join(databaseDirectoryPath, 'snapshots'), 'snapshot')
  ]);

  return [...backupEntries, ...snapshotEntries]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function getApplicationDatabasePath() {
  return openDatabaseConnection().dbPath;
}

async function listDatabaseFiles(
  directoryPath: string,
  kind: ApplicationDatabaseBackupEntry['kind']
): Promise<ApplicationDatabaseBackupEntry[]> {
  let fileNames: string[];
  try {
    fileNames = await fs.readdir(directoryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const entries = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith('.db'))
      .map(async (fileName) => {
        const filePath = path.join(directoryPath, fileName);
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
          return null;
        }
        return {
          fileName,
          filePath,
          kind,
          snapshotReason: kind === 'snapshot' ? readSnapshotReason(fileName) : null,
          sizeBytes: stats.size,
          updatedAt: stats.mtime.toISOString()
        } satisfies ApplicationDatabaseBackupEntry;
      })
  );

  return entries.filter((entry): entry is ApplicationDatabaseBackupEntry => entry !== null);
}

function readSnapshotReason(fileName: string): ApplicationDatabaseBackupEntry['snapshotReason'] {
  if (fileName.startsWith('pre-restore-')) {
    return 'pre-restore';
  }
  if (fileName.startsWith('pre-migration-')) {
    return 'pre-migration';
  }
  return null;
}
