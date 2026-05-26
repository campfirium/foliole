import fs from 'node:fs';
import path from 'node:path';

const SQLITE_FILE_SUFFIXES = ['', '-wal', '-shm'] as const;

interface DatabaseFileNameMigration {
  legacyFileName: string;
  nextFileName: string;
}

export type DatabaseFileNameMigrationStatus = 'conflict_resolved' | 'migrated' | 'skipped';

export interface DatabaseFileNameMigrationResult {
  legacyPath: string;
  nextPath: string;
  status: DatabaseFileNameMigrationStatus;
}

const DATABASE_FILE_NAME_MIGRATIONS: DatabaseFileNameMigration[] = [
  {
    legacyFileName: 'foliole-search.db',
    nextFileName: 'foliole-index.db'
  },
  {
    legacyFileName: 'external-search-cache.db',
    nextFileName: 'foliole-external.db'
  }
];

export function migrateDatabaseFileNames(databaseDirectory: string): DatabaseFileNameMigrationResult[] {
  return DATABASE_FILE_NAME_MIGRATIONS.map((migration) => migrateDatabaseFileName(databaseDirectory, migration));
}

function migrateDatabaseFileName(
  databaseDirectory: string,
  migration: DatabaseFileNameMigration
): DatabaseFileNameMigrationResult {
  const legacyPath = path.join(databaseDirectory, migration.legacyFileName);
  const nextPath = path.join(databaseDirectory, migration.nextFileName);
  const legacyState = readDatabaseFileGroupState(legacyPath);
  const nextState = readDatabaseFileGroupState(nextPath);

  if (!legacyState.hasAnyFile) {
    return { legacyPath, nextPath, status: 'skipped' };
  }
  if (legacyState.databaseSize === 0) {
    removeDatabaseFileGroup(legacyPath);
    return { legacyPath, nextPath, status: 'skipped' };
  }
  if (nextState.hasAnyFile) {
    resolveDatabaseFileNameConflict(legacyPath, nextPath, legacyState, nextState);
    return { legacyPath, nextPath, status: 'conflict_resolved' };
  }

  renameDatabaseFileGroup(legacyPath, nextPath);
  return { legacyPath, nextPath, status: 'migrated' };
}

interface DatabaseFileGroupState {
  databaseSize: number | null;
  hasAnyFile: boolean;
  updatedAtMs: number | null;
}

function readDatabaseFileGroupState(databasePath: string): DatabaseFileGroupState {
  let databaseSize: number | null = null;
  let hasAnyFile = false;
  let updatedAtMs: number | null = null;

  for (const suffix of SQLITE_FILE_SUFFIXES) {
    const stats = readFileStats(`${databasePath}${suffix}`);
    if (!stats) {
      continue;
    }
    hasAnyFile = true;
    updatedAtMs = Math.max(updatedAtMs ?? 0, stats.mtimeMs);
    if (suffix === '') {
      databaseSize = stats.size;
    }
  }

  return { databaseSize, hasAnyFile, updatedAtMs };
}

function resolveDatabaseFileNameConflict(
  legacyPath: string,
  nextPath: string,
  legacyState: DatabaseFileGroupState,
  nextState: DatabaseFileGroupState
) {
  const archiveBasePath = resolveConflictArchivePath(nextPath);
  if ((legacyState.updatedAtMs ?? 0) > (nextState.updatedAtMs ?? 0)) {
    renameDatabaseFileGroup(nextPath, archiveBasePath);
    renameDatabaseFileGroup(legacyPath, nextPath);
    return;
  }
  renameDatabaseFileGroup(legacyPath, archiveBasePath);
}

function resolveConflictArchivePath(nextPath: string) {
  const directoryPath = path.dirname(nextPath);
  const extension = path.extname(nextPath);
  const stem = path.basename(nextPath, extension);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  return path.join(directoryPath, `${stem}.pre-filename-migration-${timestamp}${extension}`);
}

function renameDatabaseFileGroup(legacyPath: string, nextPath: string) {
  for (const suffix of SQLITE_FILE_SUFFIXES) {
    renameIfExists(`${legacyPath}${suffix}`, `${nextPath}${suffix}`);
  }
}

function removeDatabaseFileGroup(databasePath: string) {
  for (const suffix of SQLITE_FILE_SUFFIXES) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

function renameIfExists(sourcePath: string, targetPath: string) {
  if (!fs.existsSync(sourcePath)) {
    return;
  }
  fs.renameSync(sourcePath, targetPath);
}

function readFileStats(filePath: string) {
  try {
    return fs.statSync(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
