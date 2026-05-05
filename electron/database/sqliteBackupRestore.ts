import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

const SQLITE_SIDECAR_SUFFIXES = ['-shm', '-wal'] as const;

export interface SqliteBackupResult {
  sourcePath: string;
  destinationPath: string;
  totalPages: number;
  remainingPages: number;
}

export interface SqliteRestoreResult {
  sourcePath: string;
  targetPath: string;
  totalPages: number;
  remainingPages: number;
}

export interface BackupSqliteDatabaseOptions {
  sourcePath: string;
  destinationPath?: string;
  sourceDatabase?: import('better-sqlite3').Database;
}

export interface RestoreSqliteDatabaseOptions {
  sourcePath: string;
  targetPath: string;
}

export function resolveDefaultSqliteBackupPath(sourcePath: string, now = new Date()): string {
  const databasePath = path.resolve(sourcePath);
  return path.join(path.dirname(databasePath), 'backups', `${backupFileStem(now)}.db`);
}

export async function backupSqliteDatabase({
  sourcePath,
  destinationPath,
  sourceDatabase
}: BackupSqliteDatabaseOptions): Promise<SqliteBackupResult> {
  const resolvedSourcePath = path.resolve(sourcePath);
  const resolvedDestinationPath = path.resolve(
    destinationPath ?? resolveDefaultSqliteBackupPath(resolvedSourcePath)
  );

  if (resolvedSourcePath === resolvedDestinationPath) {
    throw new Error('backup destination must differ from source database');
  }

  await ensureDirectory(path.dirname(resolvedDestinationPath));

  if (sourceDatabase) {
    const metadata = await sourceDatabase.backup(resolvedDestinationPath);
    return {
      sourcePath: resolvedSourcePath,
      destinationPath: resolvedDestinationPath,
      totalPages: metadata.totalPages,
      remainingPages: metadata.remainingPages
    };
  }

  const sqlite = new BetterSqlite3(resolvedSourcePath, { fileMustExist: true, readonly: true });
  try {
    const metadata = await sqlite.backup(resolvedDestinationPath);
    return {
      sourcePath: resolvedSourcePath,
      destinationPath: resolvedDestinationPath,
      totalPages: metadata.totalPages,
      remainingPages: metadata.remainingPages
    };
  } finally {
    sqlite.close();
  }
}

export async function restoreSqliteDatabase({
  sourcePath,
  targetPath
}: RestoreSqliteDatabaseOptions): Promise<SqliteRestoreResult> {
  const resolvedSourcePath = path.resolve(sourcePath);
  const resolvedTargetPath = path.resolve(targetPath);

  if (resolvedSourcePath === resolvedTargetPath) {
    throw new Error('restore source must differ from target database');
  }

  await fs.access(resolvedSourcePath);
  await ensureDirectory(path.dirname(resolvedTargetPath));

  const tempTargetPath = path.join(
    path.dirname(resolvedTargetPath),
    `.foliole-restore-${randomUUID()}.db`
  );

  const sqlite = new BetterSqlite3(resolvedSourcePath, { fileMustExist: true, readonly: true });
  let metadata: Awaited<ReturnType<import('better-sqlite3').Database['backup']>>;
  try {
    metadata = await sqlite.backup(tempTargetPath);
  } finally {
    sqlite.close();
  }

  try {
    await removeSqliteSidecars(resolvedTargetPath);
    await fs.rm(resolvedTargetPath, { force: true });
    await fs.rename(tempTargetPath, resolvedTargetPath);
  } catch (error) {
    await fs.rm(tempTargetPath, { force: true });
    throw error;
  }

  return {
    sourcePath: resolvedSourcePath,
    targetPath: resolvedTargetPath,
    totalPages: metadata.totalPages,
    remainingPages: metadata.remainingPages
  };
}

async function ensureDirectory(directoryPath: string) {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function removeSqliteSidecars(databasePath: string) {
  await Promise.all(
    SQLITE_SIDECAR_SUFFIXES.map((suffix) => fs.rm(`${databasePath}${suffix}`, { force: true }))
  );
}

function backupFileStem(now: Date) {
  return `foliole-${now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}`;
}
