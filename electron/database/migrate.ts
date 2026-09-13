import { createHash } from 'node:crypto';
import path from 'node:path';

import { readUserVersion } from '../../lib/core/database/databaseUserVersion.js';
import {
  DATABASE_SCHEMA_VERSION,
  initializeDatabaseConnection,
  isLegacyDatabaseRebuildRequiredError
} from '../../lib/core/database/migrations.js';
import { NUMBERED_MIGRATION_BASE_VERSION } from '../../lib/core/database/numberedMigrations.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { runCanonicalAttachmentMigration } from '../attachments/canonicalAttachmentMigration.js';
import { resolveDesktopHostName } from '../sync/companionLanPayloads.js';

import {
  closeDatabaseConnection,
  enableDatabaseWriteAheadLog,
  openDatabaseConnection,
  resolveDatabasePath
} from './connection.js';
import type { DatabaseFileNameMigrationResult } from './databaseFileNameMigration.js';
import { clearOpenedExternalSearchCache } from './externalSearchCacheMaintenance.js';
import { migrateDesktopHostProfile } from './hostProfile.js';
import {
  isDatabaseCorruptionError,
  moveDatabaseToPreRebuildSnapshot,
  recoverCorruptedDatabase,
  verifyDatabaseIntegrity
} from './integrity.js';
import {
  createManagedSafetySnapshotForMigration,
  settleManagedMigrationSnapshot
} from './managedSafetySnapshots.js';
import { resolveRuntimeDataPaths } from './runtimeDataPaths.js';
import { seedInitialWorkspace } from './workspaceBootstrap.js';

export { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

type DatabaseInitStageReporter = (stage: string, payload?: unknown) => void;

function shouldSkipStartupWalEnable() {
  return process.env.FOLIOLE_SKIP_STARTUP_WAL_ENABLE === '1';
}

function shouldSkipStartupSchemaInit() {
  return process.env.FOLIOLE_SKIP_STARTUP_SCHEMA_INIT === '1';
}

function reportDatabaseFileNameMigration(
  reportStage: DatabaseInitStageReporter | undefined,
  result: DatabaseFileNameMigrationResult
) {
  reportStage?.(`database_filename_migration_${result.status}`, {
    legacyPath: result.legacyPath,
    nextPath: result.nextPath
  });
}

function enableStartupWriteAheadLog(connection: ReturnType<typeof openDatabaseConnection>, reportStage?: DatabaseInitStageReporter) {
  if (shouldSkipStartupWalEnable()) {
    reportStage?.('database_wal_enable_skipped', {
      reason: 'startup-wal-enable-disabled'
    });
    return;
  }
  enableDatabaseWriteAheadLog(connection);
}

function initializeOpenedDatabase(connection: ReturnType<typeof openDatabaseConnection>, reportStage?: DatabaseInitStageReporter, deferSearchIndex = false) {
  reportStage?.('database_integrity_check_skipped', {
    reason: 'routine-startup-check-disabled'
  });
  enableStartupWriteAheadLog(connection, reportStage);
  if (shouldSkipStartupSchemaInit()) {
    reportStage?.('database_schema_init_skipped', {
      reason: 'startup-schema-init-disabled'
    });
    return connection;
  }
  reportStage?.('database_schema_init_start');
  const pendingSnapshot = createPreMigrationSnapshotIfNeeded(connection);
  let initializedConnection: ReturnType<typeof initializeSchemaWorkspaceAndSearch>;
  try {
    initializedConnection = initializeSchemaWorkspaceAndSearch(connection, resolveDesktopHostName(), deferSearchIndex);
  } catch (error) {
    pendingSnapshot?.protection.release();
    throw error;
  }
  if (pendingSnapshot) {
    settleManagedMigrationSnapshot(pendingSnapshot.snapshot, pendingSnapshot.protection);
  }
  clearOpenedExternalSearchCache();
  reportStage?.('database_schema_init_complete');
  return initializedConnection;
}

function initializeSchemaWorkspaceAndSearch(
  connection: ReturnType<typeof openDatabaseConnection>,
  currentHostName: string,
  deferSearchIndex = false
) {
  const initializedConnection = initializeDatabaseConnection(connection, {
    beforeVersionCommit: () => migrateDesktopHostProfile(connection, currentHostName)
  });
  const assetsDir = resolveRuntimeDataPaths().assetsDir;
  runCanonicalAttachmentMigration({
    assetsDir,
    journalPath: path.join(path.dirname(initializedConnection.dbPath), 'attachment-migrations', 'canonical-v1.json'),
    sqlite: initializedConnection.sqlite
  });
  publishAttachmentLibraryPathSnapshot({
    assetsDir,
    libraryScope: createHash('sha256').update(initializedConnection.dbPath).digest('hex')
  });
  seedInitialWorkspace(initializedConnection);
  return deferSearchIndex ? initializedConnection : initializeWorkspaceSearchSidecar(initializedConnection);
}

export function initializeDatabase(reportStage?: DatabaseInitStageReporter, options: { deferSearchIndex?: boolean } = {}) {
  const databasePath = resolveDatabasePath();

  try {
    reportStage?.('database_open_connection_start', {
      databasePath
    });
    const connection = openDatabaseConnection({
      applyJournalMode: false,
      reportFileNameMigration: (result) => reportDatabaseFileNameMigration(reportStage, result)
    });
    try {
      reportStage?.('database_open_connection_complete', {
        dbPath: connection.dbPath
      });
      return initializeOpenedDatabase(connection, reportStage, options.deferSearchIndex);
    } catch (error) {
      closeDatabaseConnection();
      throw error;
    }
  } catch (error) {
    if (isLegacyDatabaseRebuildRequiredError(error)) {
      return rebuildLegacyDevelopmentDatabase(databasePath, reportStage, options.deferSearchIndex);
    }
    if (!isDatabaseCorruptionError(error)) {
      throw error;
    }

    closeDatabaseConnection();
    const recovery = recoverCorruptedDatabase(resolveDatabasePath());
    console.error('[database] recovered corrupted sqlite database during startup', {
      originalPath: recovery.originalPath,
      recoveredPath: recovery.recoveredPath,
      nextStep: 'restore from a known backup if application data is missing',
      cause: error.message
    });

    reportStage?.('database_recovery_open_connection_start', {
      databasePath: resolveDatabasePath()
    });
    const connection = openDatabaseConnection({
      applyJournalMode: false,
      reportFileNameMigration: (result) => reportDatabaseFileNameMigration(reportStage, result)
    });
    reportStage?.('database_recovery_open_connection_complete', {
      dbPath: connection.dbPath
    });
    reportStage?.('database_recovery_integrity_check_start');
    verifyDatabaseIntegrity(connection.sqlite);
    reportStage?.('database_recovery_integrity_check_complete');
    enableDatabaseWriteAheadLog(connection);
    reportStage?.('database_recovery_schema_init_start');
    const initializedConnection = initializeSchemaWorkspaceAndSearch(connection, resolveDesktopHostName(), options.deferSearchIndex);
    clearOpenedExternalSearchCache();
    reportStage?.('database_recovery_schema_init_complete');
    return initializedConnection;
  }
}

function createPreMigrationSnapshotIfNeeded(connection: ReturnType<typeof openDatabaseConnection>) {
  const currentVersion = readUserVersion(connection.sqlite);
  if (currentVersion < NUMBERED_MIGRATION_BASE_VERSION || currentVersion >= DATABASE_SCHEMA_VERSION) {
    return null;
  }
  return createManagedSafetySnapshotForMigration({
    reason: 'pre-migration',
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });
}

function rebuildLegacyDevelopmentDatabase(databasePath: string, reportStage?: DatabaseInitStageReporter, deferSearchIndex = false) {
  reportStage?.('database_legacy_rebuild_start', { databasePath });
  closeDatabaseConnection();
  const snapshot = moveDatabaseToPreRebuildSnapshot(databasePath);
  reportStage?.('database_legacy_rebuild_snapshot_created', snapshot);
  const connection = openDatabaseConnection({
    reportFileNameMigration: (result) => reportDatabaseFileNameMigration(reportStage, result)
  });
  reportStage?.('database_legacy_rebuild_open_connection_complete', { dbPath: connection.dbPath });
  const initializedConnection = initializeSchemaWorkspaceAndSearch(connection, resolveDesktopHostName(), deferSearchIndex);
  clearOpenedExternalSearchCache();
  reportStage?.('database_legacy_rebuild_schema_init_complete');
  return initializedConnection;
}
