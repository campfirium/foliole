export const RETIRE_STALE_STATE_RECEIPTS_SQL = `DELETE FROM sync_delivery_receipts
  WHERE stream_name = 'state' AND NOT EXISTS (
    SELECT 1 FROM sync_object_state state
    WHERE state.object_type = sync_delivery_receipts.object_type
      AND state.object_id = sync_delivery_receipts.object_id
      AND state.content_hash = sync_delivery_receipts.payload_identity
      AND sync_delivery_receipts.operation_id =
        state.object_type || ':' || state.object_id || ':' || state.state_seq
  )`;

export const SYNC_STATE_RECEIPT_LIFECYCLE_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS trg_sync_state_receipt_insert
   AFTER INSERT ON sync_object_state BEGIN
     DELETE FROM sync_delivery_receipts WHERE stream_name = 'state'
       AND object_type = NEW.object_type AND object_id = NEW.object_id
       AND (payload_identity <> NEW.content_hash OR operation_id <>
         NEW.object_type || ':' || NEW.object_id || ':' || NEW.state_seq);
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_state_receipt_replace
   AFTER UPDATE OF state_seq, content_hash ON sync_object_state BEGIN
     DELETE FROM sync_delivery_receipts WHERE stream_name = 'state'
       AND object_type = NEW.object_type AND object_id = NEW.object_id
       AND (payload_identity <> NEW.content_hash OR operation_id <>
         NEW.object_type || ':' || NEW.object_id || ':' || NEW.state_seq);
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_state_receipt_delete
   AFTER DELETE ON sync_object_state BEGIN
     DELETE FROM sync_delivery_receipts WHERE stream_name = 'state'
       AND object_type = OLD.object_type AND object_id = OLD.object_id;
   END`
] as const;
