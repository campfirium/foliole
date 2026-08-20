export const SYNC_DELIVERY_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sync_delivery_receipts (
    authorization_id TEXT NOT NULL,
    stream_name TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    payload_identity TEXT NOT NULL,
    local_position TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'confirmed', 'conflict', 'rejected')),
    remote_position TEXT,
    issue_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (authorization_id, stream_name, operation_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_delivery_object
    ON sync_delivery_receipts (authorization_id, object_type, object_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_delivery_pending
    ON sync_delivery_receipts (authorization_id, stream_name, status, local_position)`
] as const;

export function createSyncDeliveryTableStatement(table = 'sync_delivery_receipts') {
  return SYNC_DELIVERY_SCHEMA_STATEMENTS[0].replace('sync_delivery_receipts', table);
}
