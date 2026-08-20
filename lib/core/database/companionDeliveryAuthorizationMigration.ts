import type { DbPort, DbRow, DbValue } from '../sync/dbPort.js';

import { mapDeliveryRowsToAuthorizations } from './deliveryAuthorizationMigrationModel.js';
import { createSyncDeliveryTableStatement } from './syncDeliverySchemaStatements.js';
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from './syncDeliveryTriggerStatements.js';

const TRIGGERS = [
  'trg_sync_delivery_state_insert', 'trg_sync_delivery_state_update',
  'trg_sync_delivery_member_leave', 'trg_sync_delivery_review_insert'
] as const;

export async function migrateCompanionDeliveryAuthorizations(db: DbPort) {
  if (!(await tablePresent(db, 'sync_group_members'))) return;
  for (const trigger of TRIGGERS) await db.run(`DROP TRIGGER IF EXISTS ${trigger}`);
  const result = mapDeliveryRowsToAuthorizations({
    aliases: await rows(db, 'delivery_authorization_migration_aliases'),
    cursors: await rows(db, 'sync_peer_cursors'),
    departures: await rows(db, 'sync_group_member_departures'),
    locals: await rows(db, 'sync_group_local_state'),
    members: await rows(db, 'sync_group_members'),
    receipts: await rows(db, 'sync_delivery_receipts')
  });
  await rebuildReceipts(db, result.receipts);
  await rebuildCursors(db, result.cursors);
  await db.run('DROP TABLE IF EXISTS delivery_authorization_migration_aliases');
  for (const statement of SYNC_DELIVERY_TRIGGER_STATEMENTS) await db.run(statement);
}

async function rebuildReceipts(db: DbPort, receipts: DbRow[]) {
  await db.run('DROP TABLE IF EXISTS sync_delivery_receipts_next');
  await db.run(createSyncDeliveryTableStatement('sync_delivery_receipts_next'));
  for (const row of receipts) await db.run(`INSERT INTO sync_delivery_receipts_next (
    authorization_id, stream_name, operation_id, object_type, object_id, payload_identity,
    local_position, status, remote_position, issue_reason, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values(
    row.authorization_id, row.stream_name, row.operation_id, row.object_type, row.object_id,
    row.payload_identity, row.local_position, row.status, row.remote_position, row.issue_reason,
    row.created_at, row.updated_at
  ));
  await db.run('DROP TABLE IF EXISTS sync_delivery_receipts');
  await db.run('ALTER TABLE sync_delivery_receipts_next RENAME TO sync_delivery_receipts');
  await db.run(`CREATE INDEX idx_sync_delivery_object
    ON sync_delivery_receipts (authorization_id, object_type, object_id, status)`);
  await db.run(`CREATE INDEX idx_sync_delivery_pending
    ON sync_delivery_receipts (authorization_id, stream_name, status, local_position)`);
}

async function rebuildCursors(db: DbPort, cursors: DbRow[]) {
  await db.run('DROP TABLE IF EXISTS sync_peer_cursors_next');
  await db.run(`CREATE TABLE sync_peer_cursors_next (
    authorization_id TEXT NOT NULL, stream_name TEXT NOT NULL, cursor_value TEXT NOT NULL,
    updated_at TEXT NOT NULL, PRIMARY KEY (authorization_id, stream_name))`);
  for (const row of cursors) await db.run(`INSERT INTO sync_peer_cursors_next
    (authorization_id, stream_name, cursor_value, updated_at) VALUES (?, ?, ?, ?)`,
  values(row.authorization_id, row.stream_name, row.cursor_value, row.updated_at));
  await db.run('DROP TABLE IF EXISTS sync_peer_cursors');
  await db.run('ALTER TABLE sync_peer_cursors_next RENAME TO sync_peer_cursors');
}

async function rows(db: DbPort, table: string) {
  return await tablePresent(db, table) ? db.query<DbRow>(`SELECT * FROM ${table}`) : [];
}

async function tablePresent(db: DbPort, table: string) {
  return (await db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [table])).length > 0;
}

function values(...items: unknown[]) {
  return items as DbValue[];
}
