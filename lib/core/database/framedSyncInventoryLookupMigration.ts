import type { DbPort } from '../sync/dbPort.js';

import {
  dropFramedSyncInventoryTriggers, FRAMED_SYNC_INVENTORY_LOOKUP_INDEXES, FRAMED_SYNC_INVENTORY_TRIGGERS
} from './framedSyncInventorySchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { TOPIC_DAILY_OWNER_INDEX } from './nodeChildStateSql.js';

/** Same inventory rows: only the lookups behind each trigger change, so nothing is rebuilt. */
function statements() {
  const drops = dropFramedSyncInventoryTriggers();
  return [...drops, 'DROP INDEX IF EXISTS idx_sync_topic_daily_owner', TOPIC_DAILY_OWNER_INDEX,
    ...FRAMED_SYNC_INVENTORY_LOOKUP_INDEXES, ...FRAMED_SYNC_INVENTORY_TRIGGERS];
}

export function migrateFramedSyncInventoryLookups(db: DatabaseMigrationTarget) {
  for (const sql of statements()) db.exec(sql);
}

export async function migrateCompanionFramedSyncInventoryLookups(db: DbPort) {
  for (const sql of statements()) await db.run(sql);
}
