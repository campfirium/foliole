import { randomUUID } from 'node:crypto';

import { readDataMigrationState, writeDataMigrationState } from '../../lib/core/database/dataMigrationState.js';
import { ORPHANED_INACTIVE_READING_STATE_QUERY, RETIRE_ORPHANED_INACTIVE_READING_STATE_SQL } from '../../lib/core/database/orphanedInactiveReadingState.js';

import type { DatabaseConnection } from './connection.js';

const MIGRATION_ID = 'orphaned-inactive-reading-state-v1';

export function needsOrphanedReadingStateSnapshot(connection: Pick<DatabaseConnection, 'driver' | 'sqlite'>) {
  if (readDataMigrationState(connection.sqlite, MIGRATION_ID)?.status === 'completed') return false;
  return Boolean(connection.driver.queryOne(`${ORPHANED_INACTIVE_READING_STATE_QUERY} LIMIT 1`));
}

/** Run once inside the startup schema transaction, including already upgraded libraries. */
export function migrateOrphanedInactiveReadingState(connection: Pick<DatabaseConnection, 'driver' | 'sqlite'>) {
  if (readDataMigrationState(connection.sqlite, MIGRATION_ID)?.status === 'completed') return;
  connection.driver.execute(RETIRE_ORPHANED_INACTIVE_READING_STATE_SQL);
  writeDataMigrationState(connection.sqlite, { migration_id: MIGRATION_ID, run_id: randomUUID(),
    status: 'completed', updated_at: new Date().toISOString() });
}
