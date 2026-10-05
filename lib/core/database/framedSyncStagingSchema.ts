export const FRAMED_SYNC_STAGING_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS framed_sync_outbound_publications (
    transfer_id BLOB PRIMARY KEY, content_id BLOB NOT NULL, manifest_hash BLOB NOT NULL,
    canonical_manifest BLOB NOT NULL, manifest_json TEXT NOT NULL, protocol_version INTEGER NOT NULL,
    group_id TEXT NOT NULL, sender_device_id TEXT NOT NULL, sender_library_epoch TEXT NOT NULL,
    receiver_device_id TEXT NOT NULL, receiver_library_epoch TEXT NOT NULL,
    fact_count INTEGER NOT NULL CHECK (fact_count >= 0), blob_count INTEGER NOT NULL CHECK (blob_count >= 0),
    total_blob_bytes INTEGER NOT NULL CHECK (total_blob_bytes >= 0),
    state TEXT NOT NULL CHECK (state IN ('published', 'receipt_committed', 'terminated')))`,
  `CREATE TABLE IF NOT EXISTS framed_sync_outbound_fact_refs (
    transfer_id BLOB NOT NULL REFERENCES framed_sync_outbound_publications(transfer_id) ON DELETE CASCADE,
    fact_kind INTEGER NOT NULL, object_type TEXT NOT NULL, global_id TEXT NOT NULL, fact_id TEXT NOT NULL,
    PRIMARY KEY (transfer_id, fact_kind, object_type, global_id, fact_id))`,
  `CREATE TABLE IF NOT EXISTS framed_sync_outbound_blob_refs (
    transfer_id BLOB NOT NULL REFERENCES framed_sync_outbound_publications(transfer_id) ON DELETE CASCADE,
    sha256 BLOB NOT NULL, byte_length INTEGER NOT NULL CHECK (byte_length >= 0), role INTEGER NOT NULL,
    required INTEGER NOT NULL CHECK (required IN (0, 1)), PRIMARY KEY (transfer_id, sha256))`,
  `CREATE TABLE IF NOT EXISTS framed_sync_outbound_holds (
    transfer_id BLOB PRIMARY KEY REFERENCES framed_sync_outbound_publications(transfer_id) ON DELETE CASCADE,
    member_id TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS framed_sync_outbound_attempts (
    transfer_id BLOB NOT NULL, purpose TEXT NOT NULL CHECK (purpose IN ('transfer', 'receipt')),
    attempt_id BLOB NOT NULL, nonce_prefix BLOB NOT NULL, preamble BLOB NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('prepared', 'replayable', 'abandoned')),
    PRIMARY KEY (transfer_id, purpose, attempt_id))`,
  `CREATE TABLE IF NOT EXISTS framed_sync_outbound_frames (
    transfer_id BLOB NOT NULL, purpose TEXT NOT NULL, attempt_id BLOB NOT NULL, sequence TEXT NOT NULL,
    frame_type INTEGER NOT NULL, frame_header BLOB NOT NULL, ciphertext BLOB NOT NULL,
    PRIMARY KEY (transfer_id, purpose, attempt_id, sequence), FOREIGN KEY (transfer_id, purpose, attempt_id)
      REFERENCES framed_sync_outbound_attempts(transfer_id, purpose, attempt_id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS framed_sync_inbound_transfers (
    transfer_id BLOB PRIMARY KEY, content_id BLOB NOT NULL, protocol_version INTEGER NOT NULL,
    group_id TEXT NOT NULL, sender_device_id TEXT NOT NULL, sender_library_epoch TEXT NOT NULL,
    receiver_device_id TEXT NOT NULL, receiver_library_epoch TEXT NOT NULL,
    fact_count INTEGER NOT NULL CHECK (fact_count >= 0), blob_count INTEGER NOT NULL CHECK (blob_count >= 0),
    total_blob_bytes INTEGER NOT NULL CHECK (total_blob_bytes >= 0), reservation_id TEXT NOT NULL UNIQUE,
    header_json TEXT, manifest_hash BLOB, canonical_manifest BLOB, manifest_json TEXT, active_attempt_id BLOB,
    state TEXT NOT NULL CHECK (state IN ('proposed', 'header_declared', 'receiving', 'ready_to_apply', 'applied')))`,
  `CREATE TABLE IF NOT EXISTS framed_sync_inbound_attempts (
    transfer_id BLOB NOT NULL REFERENCES framed_sync_inbound_transfers(transfer_id) ON DELETE CASCADE,
    attempt_id BLOB NOT NULL, state TEXT NOT NULL CHECK (state IN ('receiving', 'invalidated', 'promoted')),
    PRIMARY KEY (transfer_id, attempt_id))`,
  `CREATE TABLE IF NOT EXISTS framed_sync_inbound_frames (
    transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sequence TEXT NOT NULL, frame_type INTEGER NOT NULL,
    preamble BLOB NOT NULL, frame_header BLOB NOT NULL, ciphertext BLOB NOT NULL, authenticated_plaintext BLOB NOT NULL,
    PRIMARY KEY (transfer_id, attempt_id, sequence), FOREIGN KEY (transfer_id, attempt_id)
      REFERENCES framed_sync_inbound_attempts(transfer_id, attempt_id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS framed_sync_inbound_facts (
    transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, fact_kind INTEGER NOT NULL, object_type TEXT NOT NULL,
    global_id TEXT NOT NULL, fact_id TEXT NOT NULL, canonical_bytes BLOB NOT NULL,
    PRIMARY KEY (transfer_id, attempt_id, fact_kind, object_type, global_id, fact_id),
    FOREIGN KEY (transfer_id, attempt_id) REFERENCES framed_sync_inbound_attempts(transfer_id, attempt_id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS framed_sync_blob_offers (
    transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL,
    sha256 BLOB NOT NULL, byte_length INTEGER NOT NULL CHECK (byte_length >= 0), role INTEGER NOT NULL,
    required INTEGER NOT NULL CHECK (required IN (0, 1)), PRIMARY KEY (transfer_id, attempt_id, sha256),
    FOREIGN KEY (transfer_id, attempt_id)
      REFERENCES framed_sync_inbound_attempts(transfer_id, attempt_id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS framed_sync_blob_chunks (
    transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sha256 BLOB NOT NULL,
    byte_offset INTEGER NOT NULL CHECK (byte_offset >= 0), data BLOB NOT NULL,
    PRIMARY KEY (transfer_id, attempt_id, sha256, byte_offset), FOREIGN KEY (transfer_id, attempt_id)
      REFERENCES framed_sync_inbound_attempts(transfer_id, attempt_id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS framed_sync_available_blobs (
    sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL CHECK (byte_length >= 0), data BLOB NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS framed_sync_blob_pins (
    transfer_id BLOB NOT NULL REFERENCES framed_sync_inbound_transfers(transfer_id) ON DELETE CASCADE,
    sha256 BLOB NOT NULL REFERENCES framed_sync_available_blobs(sha256),
    byte_length INTEGER NOT NULL CHECK (byte_length >= 0), role INTEGER NOT NULL,
    required INTEGER NOT NULL CHECK (required IN (0, 1)), PRIMARY KEY (transfer_id, sha256))`,
  `CREATE TABLE IF NOT EXISTS framed_sync_receipts (
    transfer_id BLOB PRIMARY KEY, content_id BLOB NOT NULL, receiver_device_id TEXT NOT NULL,
    receiver_library_epoch TEXT NOT NULL, applied_state_hash BLOB NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS framed_sync_termination_requests (
    transfer_id BLOB NOT NULL REFERENCES framed_sync_outbound_publications(transfer_id) ON DELETE CASCADE,
    member_id TEXT NOT NULL, author_device_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('requested', 'acknowledged')),
    PRIMARY KEY (transfer_id, member_id))`,
  `CREATE TABLE IF NOT EXISTS framed_sync_termination_acks (
    transfer_id BLOB NOT NULL, member_id TEXT NOT NULL, PRIMARY KEY (transfer_id, member_id),
    FOREIGN KEY (transfer_id, member_id)
      REFERENCES framed_sync_termination_requests(transfer_id, member_id) ON DELETE CASCADE)`
] as const;
