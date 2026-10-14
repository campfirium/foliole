export const FRAMED_SYNC_READY_COPY_RETIREMENT = [
  "DELETE FROM framed_sync_inbound_facts WHERE transfer_id IN (SELECT transfer_id FROM framed_sync_inbound_transfers WHERE state = 'ready_to_apply')",
  "DELETE FROM framed_sync_blob_chunks WHERE transfer_id IN (SELECT transfer_id FROM framed_sync_inbound_transfers WHERE state = 'ready_to_apply')",
  "UPDATE framed_sync_inbound_transfers SET canonical_manifest = manifest_hash WHERE state = 'ready_to_apply' AND canonical_manifest IS NOT NULL"
] as const;

export const FRAMED_SYNC_READY_BLOB_FRAMES = `SELECT frame.rowid AS frame_row, authenticated_plaintext
  FROM framed_sync_inbound_frames frame JOIN framed_sync_inbound_transfers inbound USING (transfer_id)
  WHERE inbound.state = 'ready_to_apply' AND frame_type = 4 AND length(authenticated_plaintext) != 32`;
