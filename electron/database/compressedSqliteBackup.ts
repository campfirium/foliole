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
const activeTemporaryPaths = new Set<string>();

export function isCompressedSqliteBackup(filePath: string) {
  return filePath.toLowerCase().endsWith(COMPRESSED_SQLITE_BACKUP_SUFFIX);
}

export function isCompressedSqliteTemporaryPathActive(filePath: string) {
  return activeTemporaryPaths.has(path.resolve(filePath));
}

export async function backupCompressedSqliteDatabase(
  options: BackupSqliteDatabaseOptions & { destinationPath: string }
): Promise<SqliteBackupResult> {
  const destinationPath = path.resolve(options.destinationPath);
  const temporaryPath = siblingTemporaryPath(destinationPath, 'source.db');
  activeTemporaryPaths.add(temporaryPath);
  try {
    const result = await backupSqliteDatabase({ ...options, destinationPath: temporaryPath });
    await compressSqliteFile(temporaryPath, destinationPath);
    return { ...result, destinationPath };
  } finally {
    try {
      await fs.rm(temporaryPath, { force: true });
    } finally {
      activeTemporaryPaths.delete(temporaryPath);
    }
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
  await assertMaterializationSpace(resolvedSourcePath, temporaryDirectory);
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

export async function compressSqliteFile(sourcePath: string, destinationPath: string) {
  await assertCompressionSpace(sourcePath, path.dirname(destinationPath));
  const temporaryPath = siblingTemporaryPath(destinationPath, 'compressed.tmp');
  activeTemporaryPaths.add(temporaryPath);
  try {
    await pipeline(
      createReadStream(sourcePath),
      createGzip({ level: constants.Z_BEST_SPEED }),
      createWriteStream(temporaryPath, { flags: 'wx' })
    );
    await fs.link(temporaryPath, destinationPath);
  } finally {
    try {
      await fs.rm(temporaryPath, { force: true });
    } finally {
      activeTemporaryPaths.delete(temporaryPath);
    }
  }
}

async function assertCompressionSpace(sourcePath: string, destinationDirectory: string) {
  const sourceStats = await fs.stat(sourcePath);
  await assertAvailableSpace(destinationDirectory, sourceStats.size, 'compress sqlite snapshot');
}

async function assertMaterializationSpace(sourcePath: string, destinationDirectory: string) {
  const sourceStats = await fs.stat(sourcePath);
  const handle = await fs.open(sourcePath, 'r');
  try {
    const trailer = Buffer.alloc(4);
    await handle.read(trailer, 0, trailer.length, Math.max(0, sourceStats.size - trailer.length));
    const expectedBytes = Math.max(sourceStats.size, trailer.readUInt32LE(0));
    await assertAvailableSpace(destinationDirectory, expectedBytes, 'restore compressed sqlite backup');
  } finally {
    await handle.close();
  }
}

async function assertAvailableSpace(directoryPath: string, requiredBytes: number, action: string) {
  const stats = await fs.statfs(directoryPath);
  const availableBytes = stats.bavail * stats.bsize;
  if (availableBytes < requiredBytes) {
    throw new Error(`${action} requires ${requiredBytes} bytes but only ${availableBytes} bytes are available`);
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
