import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ApplicationDatabaseBackupEntry } from './backupCatalog.js';
import {
  commitVerifiedCompressedSqliteFile,
  materializeCompressedSqliteBackup
} from './compressedSqliteBackup.js';
import {
  backupSqliteDatabase,
  type BackupSqliteDatabaseOptions,
  type SqliteBackupResult
} from './sqliteBackupRestore.js';
import { verifySqliteDatabaseFileOffMainThread } from './sqliteFileOffMainThread.js';

interface CreateAutomaticBackupCandidateOptions extends BackupSqliteDatabaseOptions {
  createSnapshot?: (destinationPath: string) => Promise<SqliteBackupResult>;
  destinationPath: string;
  latestOrdinary: ApplicationDatabaseBackupEntry | null;
}

export async function commitAutomaticBackupWhenChanged(
  options: CreateAutomaticBackupCandidateOptions
): Promise<SqliteBackupResult | null> {
  const candidatePath = path.join(
    path.dirname(options.destinationPath),
    `.${path.basename(options.destinationPath)}-${randomUUID()}.source.db`
  );
  try {
    const result = options.createSnapshot
      ? await options.createSnapshot(candidatePath)
      : await backupSqliteDatabase({ ...options, destinationPath: candidatePath });
    await verifySqliteDatabaseFileOffMainThread(candidatePath);
    if (options.latestOrdinary && await matchesRestorePoint(candidatePath, options.latestOrdinary)) {
      return null;
    }
    await commitVerifiedCompressedSqliteFile(candidatePath, options.destinationPath);
    return { ...result, destinationPath: options.destinationPath };
  } finally {
    await removeCandidateGroup(candidatePath);
  }
}

async function matchesRestorePoint(candidatePath: string, restorePoint: ApplicationDatabaseBackupEntry) {
  let materialized: Awaited<ReturnType<typeof materializeCompressedSqliteBackup>> | null = null;
  try {
    materialized = await materializeCompressedSqliteBackup(
      restorePoint.filePath,
      path.dirname(candidatePath)
    );
    // The candidate was verified above, so byte-identical files also prove the restore point. Comparing bytes
    // stops at the first difference (SQLite bumps its header change counter on every write) instead of
    // checking and hashing both whole databases.
    return await sameFileBytes(candidatePath, materialized.databasePath);
  } catch (error) {
    console.warn('[backup] latest ordinary restore point could not establish change baseline', error);
    return false;
  } finally {
    await materialized?.cleanup();
  }
}

const COMPARE_CHUNK_BYTES = 1024 * 1024;

async function sameFileBytes(left: string, right: string) {
  const [a, b] = await Promise.all([fs.open(left, 'r'), fs.open(right, 'r')]);
  try {
    const [statA, statB] = await Promise.all([a.stat(), b.stat()]);
    const sizeA = statA.size;
    if (sizeA !== statB.size) return false;
    const bufferA = Buffer.alloc(COMPARE_CHUNK_BYTES);
    const bufferB = Buffer.alloc(COMPARE_CHUNK_BYTES);
    for (let offset = 0; offset < sizeA; offset += COMPARE_CHUNK_BYTES) {
      const length = Math.min(COMPARE_CHUNK_BYTES, sizeA - offset);
      const [readA, readB] = await Promise.all([
        a.read(bufferA, 0, length, offset), b.read(bufferB, 0, length, offset)]);
      if (readA.bytesRead !== length || readB.bytesRead !== length ||
          !bufferA.subarray(0, length).equals(bufferB.subarray(0, length))) return false;
    }
    return true;
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
}

async function removeCandidateGroup(databasePath: string) {
  await Promise.all(
    ['', '-journal', '-shm', '-wal'].map((suffix) => fs.rm(`${databasePath}${suffix}`, { force: true }))
  );
}
