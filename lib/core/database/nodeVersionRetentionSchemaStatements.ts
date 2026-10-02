import { NODE_VERSION_CONFIRMATION_SCHEMA } from './nodeVersionConfirmationSchema.js';

export const NODE_VERSION_RETENTION_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS node_version_local_origins (
    version_id TEXT PRIMARY KEY REFERENCES node_sync_versions(version_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS node_version_device_bases (
    group_id TEXT NOT NULL,
    device_identity_key TEXT NOT NULL,
    object_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    library_epoch TEXT NOT NULL,
    proof_revision INTEGER NOT NULL,
    pack_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, device_identity_key, object_id)
  )`,
  `CREATE TABLE IF NOT EXISTS node_version_device_revisions (
    group_id TEXT NOT NULL,
    device_identity_key TEXT NOT NULL,
    library_epoch TEXT NOT NULL,
    proof_revision INTEGER NOT NULL,
    pack_id TEXT NOT NULL,
    blocked_reason TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, device_identity_key)
  )`,
  `CREATE TABLE IF NOT EXISTS node_version_outbound_holds (
    pack_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    device_identity_key TEXT NOT NULL,
    object_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (pack_id, object_id)
  )`,
  `CREATE TABLE IF NOT EXISTS node_version_outbound_payload_holds (
    pack_id TEXT NOT NULL,
    object_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    PRIMARY KEY (pack_id, object_id, version_id)
  )`,
  `CREATE TABLE IF NOT EXISTS node_version_local_holds (
    hold_id TEXT PRIMARY KEY,
    object_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS node_version_pack_receipts (
    pack_id TEXT NOT NULL,
    object_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    device_identity_key TEXT NOT NULL,
    sent_version_id TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('applied', 'blocked', 'not_applied')),
    base_version_id TEXT,
    library_epoch TEXT NOT NULL,
    proof_revision INTEGER NOT NULL,
    confirmed_at TEXT NOT NULL,
    PRIMARY KEY (pack_id, object_id)
  )`,
  `CREATE TABLE IF NOT EXISTS node_version_local_proof_state (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    library_epoch TEXT NOT NULL,
    proof_revision INTEGER NOT NULL
  )`,
  `INSERT OR IGNORE INTO node_version_local_proof_state
    (singleton_id, library_epoch, proof_revision)
    VALUES (1, lower(hex(randomblob(16))), 0)`,
  `CREATE TABLE IF NOT EXISTS node_version_local_source_revisions (
    source_device_identity_key TEXT PRIMARY KEY,
    proof_revision INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS node_version_inbound_receipts (
    pack_id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    source_device_identity_key TEXT NOT NULL,
    target_device_identity_key TEXT NOT NULL,
    library_epoch TEXT NOT NULL,
    proof_revision INTEGER NOT NULL,
    results_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    delivered_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_node_version_local_holds_object
    ON node_version_local_holds (object_id, version_id)`,
  `CREATE INDEX IF NOT EXISTS idx_node_version_outbound_holds_object
    ON node_version_outbound_holds (object_id, version_id)`,
  `CREATE INDEX IF NOT EXISTS idx_node_version_outbound_payload_holds_object
    ON node_version_outbound_payload_holds (object_id, version_id)`,
  NODE_VERSION_CONFIRMATION_SCHEMA
] as const;
