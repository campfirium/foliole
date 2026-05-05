import { initializeDatabaseConnection } from '../../lib/core/database/migrations.js';

import { openDatabaseConnection } from './connection.js';

export { DATABASE_SCHEMA_VERSION, runDatabaseMigrations } from '../../lib/core/database/migrations.js';

export function initializeDatabase() {
  return initializeDatabaseConnection(openDatabaseConnection());
}
