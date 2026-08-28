import {
  mapDeliveryRowsToAuthorizations,
  type DeliveryMigrationRow
} from './deliveryAuthorizationMigrationModel.js';
import {
  createLegacyAuthorizationDeliveryTableStatement,
  LEGACY_HOST_SYNC_DELIVERY_TRIGGER_STATEMENTS
} from './legacyHostSyncGroupSchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';

const TRIGGERS = [
  'trg_sync_delivery_state_insert', 'trg_sync_delivery_state_update',
  'trg_sync_delivery_member_leave', 'trg_sync_delivery_review_insert'
] as const;

export function migrateDeliveryAuthorizations(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'sync_group_members')) return;
  dropTriggers(sqlite);
  const result = mapDeliveryRowsToAuthorizations({
    aliases: rows(sqlite, 'delivery_authorization_migration_aliases'),
    cursors: rows(sqlite, 'sync_peer_cursors'),
    departures: rows(sqlite, 'sync_group_member_departures'),
    locals: rows(sqlite, 'sync_group_local_state'),
    members: rows(sqlite, 'sync_group_members'),
    receipts: rows(sqlite, 'sync_delivery_receipts')
  });
  rebuildReceipts(sqlite, result.receipts);
  rebuildCursors(sqlite, result.cursors);
  sqlite.exec('DROP TABLE IF EXISTS delivery_authorization_migration_aliases');
  if (tableExists(sqlite, 'sync_object_state')) {
    for (const statement of LEGACY_HOST_SYNC_DELIVERY_TRIGGER_STATEMENTS) sqlite.exec(statement);
  }
}

function rebuildReceipts(sqlite: DatabaseMigrationTarget, receipts: DeliveryMigrationRow[]) {
  sqlite.exec('DROP TABLE IF EXISTS sync_delivery_receipts_next');
  sqlite.exec(createLegacyAuthorizationDeliveryTableStatement('sync_delivery_receipts_next'));
  const insert = sqlite.prepare(`INSERT INTO sync_delivery_receipts_next (
    authorization_id, stream_name, operation_id, object_type, object_id, payload_identity,
    local_position, status, remote_position, issue_reason, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of receipts) insert.run(
    row.authorization_id, row.stream_name, row.operation_id, row.object_type, row.object_id,
    row.payload_identity, row.local_position, row.status, row.remote_position, row.issue_reason,
    row.created_at, row.updated_at
  );
  sqlite.exec('DROP TABLE IF EXISTS sync_delivery_receipts');
  sqlite.exec('ALTER TABLE sync_delivery_receipts_next RENAME TO sync_delivery_receipts');
  sqlite.exec(`CREATE INDEX idx_sync_delivery_object
    ON sync_delivery_receipts (authorization_id, object_type, object_id, status)`);
  sqlite.exec(`CREATE INDEX idx_sync_delivery_pending
    ON sync_delivery_receipts (authorization_id, stream_name, status, local_position)`);
}

function rebuildCursors(sqlite: DatabaseMigrationTarget, cursors: DeliveryMigrationRow[]) {
  sqlite.exec('DROP TABLE IF EXISTS sync_peer_cursors_next');
  sqlite.exec(`CREATE TABLE sync_peer_cursors_next (
    authorization_id TEXT NOT NULL, stream_name TEXT NOT NULL, cursor_value TEXT NOT NULL,
    updated_at TEXT NOT NULL, PRIMARY KEY (authorization_id, stream_name))`);
  const insert = sqlite.prepare(`INSERT INTO sync_peer_cursors_next
    (authorization_id, stream_name, cursor_value, updated_at) VALUES (?, ?, ?, ?)`);
  for (const row of cursors) insert.run(row.authorization_id, row.stream_name, row.cursor_value, row.updated_at);
  sqlite.exec('DROP TABLE IF EXISTS sync_peer_cursors');
  sqlite.exec('ALTER TABLE sync_peer_cursors_next RENAME TO sync_peer_cursors');
}

function rows(sqlite: DatabaseMigrationTarget, table: string): DeliveryMigrationRow[] {
  if (!tableExists(sqlite, table)) return [];
  return sqlite.prepare(`SELECT * FROM ${table}`).all() as DeliveryMigrationRow[];
}

function dropTriggers(sqlite: DatabaseMigrationTarget) {
  for (const trigger of TRIGGERS) sqlite.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
}
