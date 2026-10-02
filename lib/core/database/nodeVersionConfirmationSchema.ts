export const NODE_VERSION_CONFIRMATION_SCHEMA = `CREATE TABLE IF NOT EXISTS node_version_confirmation_state (
  group_id TEXT NOT NULL,
  device_identity_key TEXT NOT NULL,
  library_epoch TEXT NOT NULL,
  proof_revision INTEGER NOT NULL,
  pack_id TEXT NOT NULL,
  receipt_digest TEXT NOT NULL,
  PRIMARY KEY (group_id, device_identity_key),
  FOREIGN KEY (group_id, device_identity_key) REFERENCES node_version_device_revisions
    (group_id, device_identity_key) ON DELETE CASCADE
)`;
