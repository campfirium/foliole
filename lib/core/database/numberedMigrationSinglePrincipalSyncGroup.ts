import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { SYNC_DELIVERY_SCHEMA_STATEMENTS } from './syncDeliverySchemaStatements.js';
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from './syncDeliveryTriggerStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';

export const SYNC_GROUP_CUTOVER_GATE_TABLE = 'foliole_sync_group_cutover_gate';

function rowCount(sqlite: DatabaseMigrationTarget, table: string) {
  const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).all()[0] as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

function hasCutoverGate(sqlite: DatabaseMigrationTarget) {
  const rows = sqlite.prepare("SELECT name FROM sqlite_temp_master WHERE type = 'table' AND name = ?")
    .all(SYNC_GROUP_CUTOVER_GATE_TABLE);
  return rows.length === 1;
}

export function migrateSinglePrincipalSyncGroup(sqlite: DatabaseMigrationTarget) {
  if (rowCount(sqlite, 'sync_groups') > 0 && !hasCutoverGate(sqlite)) {
    throw new Error('sync_group_cutover_confirmation_required');
  }
  for (const trigger of [
    'trg_sync_delivery_state_insert', 'trg_sync_delivery_state_update',
    'trg_sync_delivery_member_leave', 'trg_sync_delivery_review_insert'
  ]) sqlite.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  for (const table of [
    'sync_group_host_aliases', 'sync_group_member_departures', 'sync_group_members',
    'sync_group_local_state', 'sync_group_nonce_ledger', 'sync_groups',
    'sync_delivery_receipts', 'sync_peer_cursors'
  ]) sqlite.exec(`DROP TABLE IF EXISTS ${table}`);
  sqlite.exec(`CREATE TABLE sync_peer_cursors (
    peer_id TEXT NOT NULL, stream_name TEXT NOT NULL, cursor_value TEXT NOT NULL,
    updated_at TEXT NOT NULL, PRIMARY KEY (peer_id, stream_name)
  )`);
  for (const statement of SYNC_DELIVERY_SCHEMA_STATEMENTS) sqlite.exec(statement);
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  for (const statement of SYNC_DELIVERY_TRIGGER_STATEMENTS) sqlite.exec(statement);
}
