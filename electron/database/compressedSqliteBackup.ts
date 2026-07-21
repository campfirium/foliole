import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip, constants } from 'node:zlib';

import {
  backupSqliteDatabase,
  type BackupSqliteDatabaseOptions,
  type SqliteBackupResult
} from './sqliteBackupRestore.js';

export const COMPRESSED_SQLITE_BACKUP_SUFFIX = '.db.gz';

export function isCompressedSqliteBackup(filePath: string) {
  return filePath.toLowerCase().endsWith(COMPRESSED_SQLITE_BACKUP_SUFFIX);
}

export async function backupCompressedSqliteDatabase(
  options: BackupSqliteDatabaseOptions & { destinationPath: string }
): Promise<SqliteBackupResult> {
  const destinationPath = path.resolve(options.destinationPath);
  const temporaryPath = siblingTemporaryPath(destinationPath, 'source.db');
  try {
    const result = await backupSqliteDatabase({ ...options, destinationPath: temporaryPath });
    await compressSqliteFile(temporaryPath, destinationPath);
    return { ...result, destinationPath };
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

export async function materializeCompressedSqliteBackup(
  sourcePath: string,
  temporaryDirectory: string
): Promise<{ cleanup: () => Promise<void>; databasePath: string }> {
  const resolvedSourcePath = path.resolve(sourcePath);
  if (!isCompressedSqliteBackup(resolvedSourcePath)) {
    return { cleanup: async () => undefined, databasePath: resolvedSourcePath };
  }
  await fs.mkdir(temporaryDirectory, { recursive: true });
  const databasePath = path.join(temporaryDirectory, `.foliole-restore-source-${randomUUID()}.db`);
  try {
    await pipeline(
      createReadStream(resolvedSourcePath),
      createGunzip(),
      createWriteStream(databasePath, { flags: 'wx' })
    );
    return {
      cleanup: () => removeSqliteFileGroup(databasePath),
      databasePath
    };
  } catch (error) {
    await removeSqliteFileGroup(databasePath);
    throw error;
  }
}

async function compressSqliteFile(sourcePath: string, destinationPath: string) {
  const temporaryPath = siblingTemporaryPath(destinationPath, 'compressed.tmp');
  try {
    await pipeline(
      createReadStream(sourcePath),
      createGzip({ level: constants.Z_BEST_SPEED }),
      createWriteStream(temporaryPath, { flags: 'wx' })
    );
    await fs.rename(temporaryPath, destinationPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

function siblingTemporaryPath(destinationPath: string, suffix: string) {
  return path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}-${randomUUID()}.${suffix}`
  );
}

async function removeSqliteFileGroup(databasePath: string) {
  await Promise.all(
    ['', '-journal', '-shm', '-wal'].map((suffix) => fs.rm(`${databasePath}${suffix}`, { force: true }))
  );
}
