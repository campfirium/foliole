import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { RETIRE_STALE_STATE_RECEIPTS_SQL, SYNC_STATE_RECEIPT_LIFECYCLE_TRIGGERS } from './syncStateReceiptLifecycle.js';

const ENTITIES = [
  ['node', 'nodes', 'id'],
  ['node_reading', 'node_reading', 'node_id'],
  ['node_review', 'node_review', 'node_id'],
  ['import_source', 'import_sources', 'source_fingerprint']
] as const;

function removeUnbackedCleanStateSql(type: string, table: string, key: string) {
  const nodeEvidence = type === 'node' ? `
    AND NOT EXISTS (SELECT 1 FROM node_sync_tombstones t WHERE t.node_id = sync_object_state.object_id)
    AND NOT EXISTS (SELECT 1 FROM node_sync_versions v WHERE v.object_id = sync_object_state.object_id)` : '';
  return `DELETE FROM sync_object_state WHERE object_type = '${type}'
    AND deleted_at IS NULL AND sync_dirty = 0
    AND NOT EXISTS (SELECT 1 FROM ${table} entity WHERE entity.${key} = sync_object_state.object_id)
    ${nodeEvidence}`;
}

export function repairSyncStateEntities(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'sync_object_state')) return;
  for (const [type, table, key] of ENTITIES) {
    if (!tableExists(sqlite, table)) continue;
    if (type === 'node' && (!tableExists(sqlite, 'node_sync_tombstones') ||
        !tableExists(sqlite, 'node_sync_versions'))) continue;
    sqlite.exec(removeUnbackedCleanStateSql(type, table, key));
  }
  if (!tableExists(sqlite, 'sync_delivery_receipts')) return;
  sqlite.exec(RETIRE_STALE_STATE_RECEIPTS_SQL);
  for (const statement of SYNC_STATE_RECEIPT_LIFECYCLE_TRIGGERS) sqlite.exec(statement);
}

export async function repairCompanionSyncStateEntities(db: DbPort) {
  for (const [type, table, key] of ENTITIES) {
    await db.run(removeUnbackedCleanStateSql(type, table, key));
  }
  await db.run(RETIRE_STALE_STATE_RECEIPTS_SQL);
  for (const statement of SYNC_STATE_RECEIPT_LIFECYCLE_TRIGGERS) await db.run(statement);
}
