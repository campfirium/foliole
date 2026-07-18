import { readUserVersion, setUserVersion } from './databaseUserVersion.js';
import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from './desktopFreshSchemaStatements.js';
import type { DatabaseConnectionLike, DatabaseMigrationTarget } from './migrationTypes.js';
import { applyNumberedSchemaMigrations } from './numberedMigrations.js';

export const DATABASE_SCHEMA_VERSION = 57;

const LEGACY_REBUILD_REQUIRED_MESSAGE =
  'existing database schema is no longer supported; reset foliole.db and initialize fresh schema';

function createFreshSchema(sqlite: DatabaseMigrationTarget) {
  for (const statement of DESKTOP_FRESH_SCHEMA_STATEMENTS) {
    sqlite.exec(statement);
  }
  setUserVersion(sqlite, DATABASE_SCHEMA_VERSION);
}

export function initializeDatabaseSchema(sqlite: DatabaseMigrationTarget) {
  const currentVersion = readUserVersion(sqlite);
  if (currentVersion === DATABASE_SCHEMA_VERSION) {
    return;
  }
  const applyInTransaction = sqlite.transaction(() => {
    if (currentVersion === 0) {
      createFreshSchema(sqlite);
      return;
    }
    if (currentVersion === DATABASE_SCHEMA_VERSION) {
      return;
    }
    if (currentVersion > DATABASE_SCHEMA_VERSION) {
      throw new Error(`database schema version ${currentVersion} is newer than supported`);
    }
    applyNumberedSchemaMigrations({
      currentVersion,
      legacyMessage: LEGACY_REBUILD_REQUIRED_MESSAGE,
      setUserVersion: (version) => setUserVersion(sqlite, version),
      sqlite,
      targetVersion: DATABASE_SCHEMA_VERSION
    });
  });
  applyInTransaction();
}

export function initializeDatabaseConnection<T extends DatabaseConnectionLike>(connection: T): T {
  initializeDatabaseSchema(connection.sqlite);
  return connection;
}

export function isLegacyDatabaseRebuildRequiredError(error: unknown): error is Error {
  return error instanceof Error && error.message === LEGACY_REBUILD_REQUIRED_MESSAGE;
}
