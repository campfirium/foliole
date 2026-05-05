import {
  initializeDatabaseConnection,
  isLegacyDatabaseRebuildRequiredError
} from '../../lib/core/database/migrations.js';

import { closeDatabaseConnection, openDatabaseConnection, resolveDatabasePath } from './connection.js';
import {
  isDatabaseCorruptionError,
  moveDatabaseToPreRebuildSnapshot,
  recoverCorruptedDatabase,
  verifyDatabaseIntegrity
} from './integrity.js';
import { seedInitialWorkspace } from './workspaceBootstrap.js';

export { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

type DatabaseInitStageReporter = (stage: string, payload?: unknown) => void;

export function initializeDatabase(reportStage?: DatabaseInitStageReporter) {
  const databasePath = resolveDatabasePath();

  try {
    reportStage?.('database_open_connection_start', {
      databasePath
    });
    const connection = openDatabaseConnection();
    try {
      reportStage?.('database_open_connection_complete', {
        dbPath: connection.dbPath
      });
      reportStage?.('database_integrity_check_start');
      verifyDatabaseIntegrity(connection.sqlite);
      reportStage?.('database_integrity_check_complete');
      reportStage?.('database_schema_init_start');
      const initializedConnection = initializeDatabaseConnection(connection);
      reportStage?.('database_schema_init_complete');
      seedInitialWorkspace(initializedConnection);
      return initializedConnection;
    } catch (error) {
      closeDatabaseConnection();
      throw error;
    }
  } catch (error) {
    if (isLegacyDatabaseRebuildRequiredError(error)) {
      return rebuildLegacyDevelopmentDatabase(databasePath, reportStage);
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
    const connection = openDatabaseConnection();
    reportStage?.('database_recovery_open_connection_complete', {
      dbPath: connection.dbPath
    });
    reportStage?.('database_recovery_integrity_check_start');
    verifyDatabaseIntegrity(connection.sqlite);
    reportStage?.('database_recovery_integrity_check_complete');
    reportStage?.('database_recovery_schema_init_start');
    const initializedConnection = initializeDatabaseConnection(connection);
    reportStage?.('database_recovery_schema_init_complete');
    seedInitialWorkspace(initializedConnection);
    return initializedConnection;
  }
}

function rebuildLegacyDevelopmentDatabase(databasePath: string, reportStage?: DatabaseInitStageReporter) {
  reportStage?.('database_legacy_rebuild_start', { databasePath });
  closeDatabaseConnection();
  const snapshot = moveDatabaseToPreRebuildSnapshot(databasePath);
  reportStage?.('database_legacy_rebuild_snapshot_created', snapshot);
  const connection = openDatabaseConnection();
  reportStage?.('database_legacy_rebuild_open_connection_complete', { dbPath: connection.dbPath });
  const initializedConnection = initializeDatabaseConnection(connection);
  reportStage?.('database_legacy_rebuild_schema_init_complete');
  seedInitialWorkspace(initializedConnection);
  return initializedConnection;
}
