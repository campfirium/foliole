export const SYNC_IDENTITY_RECEIPT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sync_identity_receive_rounds (
    group_id TEXT NOT NULL,
    source_peer_id TEXT NOT NULL,
    source_view_id TEXT NOT NULL,
    last_page_index INTEGER NOT NULL CHECK (last_page_index >= 0),
    last_page_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, source_peer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_identity_retired_views (
    group_id TEXT NOT NULL,
    source_peer_id TEXT NOT NULL,
    source_view_id TEXT NOT NULL,
    retired_at TEXT NOT NULL,
    PRIMARY KEY (group_id, source_peer_id, source_view_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_identity_pack_receipts (
    group_id TEXT NOT NULL,
    source_peer_id TEXT NOT NULL,
    source_view_id TEXT NOT NULL,
    page_id TEXT NOT NULL,
    pack_id TEXT NOT NULL,
    database_sha256 TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    PRIMARY KEY (group_id, source_peer_id, pack_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_identity_peer_baselines (
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    local_device_id TEXT NOT NULL,
    peer_device_id TEXT NOT NULL,
    local_epoch TEXT NOT NULL,
    peer_epoch TEXT NOT NULL,
    local_watermark TEXT NOT NULL,
    peer_watermark TEXT NOT NULL,
    local_view_id TEXT NOT NULL,
    peer_view_id TEXT NOT NULL,
    local_proof_root TEXT NOT NULL DEFAULT '',
    peer_proof_root TEXT NOT NULL DEFAULT '',
    proof_contract_revision TEXT NOT NULL DEFAULT '',
    verified_at TEXT NOT NULL,
    PRIMARY KEY (group_id, local_device_id, peer_device_id)
  )`
] as const;
