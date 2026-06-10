import fs from 'node:fs';
import path from 'node:path';

export type SqliteDatabase = import('better-sqlite3').Database;

const SQLITE_RECOVERY_SUFFIXES = ['', '-shm', '-wal', '-journal'];
const SQLITE_CORRUPTION_PATTERN =
  /SQLITE_CORRUPT|SQLITE_NOTADB|database disk image is malformed|file is encrypted or is not a database|file is not a database|malformed database schema|not a database/i;

class DatabaseIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseIntegrityError';
  }
}

export interface DatabaseRecoveryResult {
  originalPath: string;
  recoveredPath: string;
}

export interface DatabasePreRebuildSnapshotResult {
  originalPath: string;
  snapshotPath: string;
}

export function verifyDatabaseIntegrity(sqlite: SqliteDatabase) {
  const quickCheck = sqlite.prepare('PRAGMA quick_check(1)').pluck().get();
  if (quickCheck !== 'ok') {
    throw new DatabaseIntegrityError(`sqlite quick_check failed: ${String(quickCheck ?? 'unknown')}`);
  }
}

export function isDatabaseCorruptionError(error: unknown): error is Error {
  return error instanceof DatabaseIntegrityError ||
    (error instanceof Error && SQLITE_CORRUPTION_PATTERN.test(error.message));
}

export function recoverCorruptedDatabase(
  databasePath: string,
  now = new Date()
): DatabaseRecoveryResult {
  const resolvedDatabasePath = path.resolve(databasePath);
  const recoveryDir = path.join(path.dirname(resolvedDatabasePath), 'recovery');
  const recoveredPath = path.join(recoveryDir, recoveryFileName(resolvedDatabasePath, now));

  if (!fs.existsSync(resolvedDatabasePath)) {
    throw new Error(`sqlite database does not exist: ${resolvedDatabasePath}`);
  }

  fs.mkdirSync(recoveryDir, { recursive: true });
  for (const suffix of SQLITE_RECOVERY_SUFFIXES) {
    moveIfPresent(`${resolvedDatabasePath}${suffix}`, `${recoveredPath}${suffix}`);
  }

  return {
    originalPath: resolvedDatabasePath,
    recoveredPath
  };
}

export function moveDatabaseToPreRebuildSnapshot(
  databasePath: string,
  now = new Date()
): DatabasePreRebuildSnapshotResult {
  const resolvedDatabasePath = path.resolve(databasePath);
  const snapshotPath = path.join(
    path.dirname(resolvedDatabasePath),
    'pre-rebuild',
    timestamp(now),
    path.basename(resolvedDatabasePath)
  );

  if (!fs.existsSync(resolvedDatabasePath)) {
    throw new Error(`sqlite database does not exist: ${resolvedDatabasePath}`);
  }

  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  for (const suffix of SQLITE_RECOVERY_SUFFIXES) {
    moveIfPresent(`${resolvedDatabasePath}${suffix}`, `${snapshotPath}${suffix}`);
  }

  return {
    originalPath: resolvedDatabasePath,
    snapshotPath
  };
}

function moveIfPresent(sourcePath: string, targetPath: string) {
  if (!fs.existsSync(sourcePath)) {
    return;
  }
  fs.renameSync(sourcePath, targetPath);
}

function recoveryFileName(databasePath: string, now: Date) {
  const extension = path.extname(databasePath) || '.db';
  const stem = path.basename(databasePath, extension);
  return `${stem}-corrupt-${timestamp(now)}${extension}`;
}

function timestamp(now: Date) {
  return now.toISOString().replace(/[:.]/g, '-');
}
