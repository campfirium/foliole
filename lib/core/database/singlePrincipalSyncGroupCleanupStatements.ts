import { SYNC_DELIVERY_SCHEMA_STATEMENTS } from './syncDeliverySchemaStatements.js';
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from './syncDeliveryTriggerStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';

const RETIRED_SYNC_TRIGGERS = [
  'trg_sync_delivery_state_insert',
  'trg_sync_delivery_state_update',
  'trg_sync_delivery_member_leave',
  'trg_sync_delivery_device_leave',
  'trg_sync_delivery_review_insert'
] as const;

const RETIRED_SYNC_TABLES = [
  'delivery_authorization_migration_aliases',
  'sync_group_host_aliases',
  'sync_group_member_departures',
  'sync_group_members',
  'sync_group_devices',
  'sync_group_local_state',
  'sync_group_nonce_ledger',
  'sync_groups',
  'sync_delivery_receipts',
  'sync_peer_cursors',
  'sync_push_ack'
] as const;

export const SINGLE_PRINCIPAL_SYNC_GROUP_CLEANUP_STATEMENTS = [
  ...RETIRED_SYNC_TRIGGERS.map((name) => `DROP TRIGGER IF EXISTS ${name}`),
  ...RETIRED_SYNC_TABLES.map((name) => `DROP TABLE IF EXISTS ${name}`),
  `CREATE TABLE sync_peer_cursors (
    peer_id TEXT NOT NULL,
    stream_name TEXT NOT NULL,
    cursor_value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (peer_id, stream_name)
  )`,
  ...SYNC_DELIVERY_SCHEMA_STATEMENTS,
  ...SYNC_GROUP_SCHEMA_STATEMENTS,
  ...SYNC_DELIVERY_TRIGGER_STATEMENTS
] as const;
