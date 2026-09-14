import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

import type { ApplicationDatabaseBackupEntry } from './backupCatalog.js';
import {
  commitVerifiedCompressedSqliteFile,
  materializeCompressedSqliteBackup
} from './compressedSqliteBackup.js';
import {
  backupSqliteDatabase,
  verifySqliteDatabaseFile,
  type BackupSqliteDatabaseOptions,
  type SqliteBackupResult
} from './sqliteBackupRestore.js';

interface CreateAutomaticBackupCandidateOptions extends BackupSqliteDatabaseOptions {
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
    const result = await backupSqliteDatabase({ ...options, destinationPath: candidatePath });
    verifySqliteDatabaseFile(candidatePath);
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
    verifySqliteDatabaseFile(materialized.databasePath);
    const [candidateHash, restorePointHash] = await Promise.all([
      hashFile(candidatePath),
      hashFile(materialized.databasePath)
    ]);
    return candidateHash === restorePointHash;
  } catch (error) {
    console.warn('[backup] latest ordinary restore point could not establish change baseline', error);
    return false;
  } finally {
    await materialized?.cleanup();
  }
}

async function hashFile(filePath: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function removeCandidateGroup(databasePath: string) {
  await Promise.all(
    ['', '-journal', '-shm', '-wal'].map((suffix) => fs.rm(`${databasePath}${suffix}`, { force: true }))
  );
}
