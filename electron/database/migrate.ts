import fs from 'node:fs';

import {
  DATABASE_SCHEMA_VERSION,
  initializeDatabaseConnection
} from '../../lib/core/database/migrations.js';

import { closeDatabaseConnection, openDatabaseConnection, resolveDatabasePath } from './connection.js';
import {
  isDatabaseCorruptionError,
  recoverCorruptedDatabase,
  verifyDatabaseIntegrity
} from './integrity.js';
import { createInternalDatabaseSnapshot } from './internalSnapshots.js';

export { DATABASE_SCHEMA_VERSION, runDatabaseMigrations } from '../../lib/core/database/migrations.js';

export function initializeDatabase() {
  const databasePath = resolveDatabasePath();
  const shouldSnapshotBeforeMigration = shouldSnapshotExistingDatabase(databasePath);

  try {
    const connection = openDatabaseConnection();
    try {
      verifyDatabaseIntegrity(connection.sqlite);
      snapshotBeforePendingMigration(connection, shouldSnapshotBeforeMigration);
      return initializeDatabaseConnection(connection);
    } catch (error) {
      closeDatabaseConnection();
      throw error;
    }
  } catch (error) {
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

    const connection = openDatabaseConnection();
    verifyDatabaseIntegrity(connection.sqlite);
    return initializeDatabaseConnection(connection);
  }
}

function snapshotBeforePendingMigration(
  connection: ReturnType<typeof openDatabaseConnection>,
  shouldSnapshotBeforeMigration: boolean
) {
  if (!shouldSnapshotBeforeMigration) {
    return;
  }

  if (readUserVersion(connection.sqlite) >= DATABASE_SCHEMA_VERSION) {
    return;
  }

  createInternalDatabaseSnapshot({
    reason: 'pre-migration',
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });
}

function shouldSnapshotExistingDatabase(databasePath: string) {
  try {
    const stats = fs.statSync(databasePath);
    return stats.isFile() && stats.size > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function readUserVersion(sqlite: ReturnType<typeof openDatabaseConnection>['sqlite']) {
  const value = sqlite.pragma('user_version', { simple: true });
  return typeof value === 'number' ? value : Number(value ?? 0);
}
