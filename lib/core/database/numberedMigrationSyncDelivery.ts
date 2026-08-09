import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { SYNC_DELIVERY_LEGACY_BACKFILL_SQL } from './syncDeliveryMigrationStatements.js';
import { SYNC_DELIVERY_SCHEMA_STATEMENTS } from './syncDeliverySchemaStatements.js';
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from './syncDeliveryTriggerStatements.js';

export function migrateSyncDeliveryReceipts(sqlite: DatabaseMigrationTarget) {
  for (const statement of SYNC_DELIVERY_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.exec('DROP TABLE IF EXISTS sync_push_ack');
  sqlite.exec(SYNC_DELIVERY_LEGACY_BACKFILL_SQL);
  for (const statement of SYNC_DELIVERY_TRIGGER_STATEMENTS) sqlite.exec(statement);
}
