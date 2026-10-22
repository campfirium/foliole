import Database from 'better-sqlite3';

import { mergeRestoredForegroundTime, type ForegroundTimePreservation } from '../../lib/core/database/foregroundTimeRestore.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { clearDatabaseUpgradeProgress, reportDatabaseUpgradeProgress } from './databaseUpgradeStatus.js';
import { runDatabaseUpgradeWorker } from './databaseUpgradeWorkerClient.js';
import { prepareLegacyAttachmentFiles } from './legacyAttachmentFiles.js';
import { captureLegacyAttachmentTargets, migrateLegacyAttachmentReferences } from './legacyAttachmentReferenceMigration.js';
import { createManagedSafetySnapshotWithBackup, type ManagedSafetySnapshot } from './managedSafetySnapshots.js';
import { resolveRuntimeDataPaths } from './runtimeDataPaths.js';

async function upgradeCandidateOffMainThread(dbPath: string, hostName: string) {
  try {
    await runDatabaseUpgradeWorker({ assetsDir: resolveRuntimeDataPaths().assetsDir, dbPath, hostName,
      scope: 'restore-candidate', snapshotPath: null }, reportDatabaseUpgradeProgress);
  } catch (error) {
    console.error('[backup] background candidate upgrade failed; upgrading on the main thread', error);
  } finally {
    clearDatabaseUpgradeProgress();
  }
}

export async function prepareForegroundTimeBackupCandidate(databasePath: string,
  preserved: ForegroundTimePreservation, hostName: string) {
  const db = new Database(databasePath, { fileMustExist: true });
  let snapshot: ManagedSafetySnapshot | null = null;
  try {
    const version = db.pragma('user_version', { simple: true }) as number;
    if (version >= 28 && version < DATABASE_SCHEMA_VERSION) {
      snapshot = await createManagedSafetySnapshotWithBackup({ reason: 'pre-migration',
        sourceDatabase: db, sourcePath: databasePath });
    }
    if (version >= 28 && version < DATABASE_SCHEMA_VERSION) await upgradeCandidateOffMainThread(databasePath, hostName);
    // Already current after the worker; otherwise this upgrades on the main thread as before.
    const connection = { sqlite: db, driver: createBetterSqlite3Driver(db) };
    const targets = captureLegacyAttachmentTargets(connection);
    initializeDatabaseSchema(db, { beforeVersionCommit: () => {
      prepareLegacyAttachmentFiles(resolveRuntimeDataPaths().assetsDir, targets);
      migrateLegacyAttachmentReferences(connection, targets, hostName);
    } });
    await mergeRestoredForegroundTime(createBetterSqliteDbPort(db), preserved, hostName);
  } finally { snapshot?.release(); db.close(); }
}
