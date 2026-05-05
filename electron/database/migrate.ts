import { initializeDatabaseConnection } from '../../lib/core/database/migrations.js';

import { closeDatabaseConnection, openDatabaseConnection, resolveDatabasePath } from './connection.js';
import {
  isDatabaseCorruptionError,
  recoverCorruptedDatabase,
  verifyDatabaseIntegrity
} from './integrity.js';
import { prepareLibraryDataForStartup } from './libraryDataMigration.js';

export { DATABASE_SCHEMA_VERSION, runDatabaseMigrations } from '../../lib/core/database/migrations.js';

export function initializeDatabase() {
  prepareLibraryDataForStartup();
  try {
    const connection = openDatabaseConnection();
    verifyDatabaseIntegrity(connection.sqlite);
    return initializeDatabaseConnection(connection);
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
