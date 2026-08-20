import {
  LEGACY_SYNC_DELIVERY_SCHEMA_STATEMENTS,
  LEGACY_SYNC_DELIVERY_TRIGGER_STATEMENTS
} from './legacySyncDeliverySchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { SYNC_DELIVERY_LEGACY_BACKFILL_SQL } from './syncDeliveryMigrationStatements.js';

export function migrateSyncDeliveryReceipts(sqlite: DatabaseMigrationTarget) {
  for (const statement of LEGACY_SYNC_DELIVERY_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.exec('DROP TABLE IF EXISTS sync_push_ack');
  if (!tableExists(sqlite, 'sync_object_state')) return;
  sqlite.exec(SYNC_DELIVERY_LEGACY_BACKFILL_SQL);
  for (const statement of LEGACY_SYNC_DELIVERY_TRIGGER_STATEMENTS) sqlite.exec(statement);
}
