export const FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA = `CREATE TABLE IF NOT EXISTS framed_sync_resource_demands (
  group_id TEXT NOT NULL, receiver_device_id TEXT NOT NULL, receiver_library_epoch TEXT NOT NULL,
  global_id TEXT NOT NULL, version_id TEXT NOT NULL, body_hash TEXT NOT NULL, storage_key TEXT NOT NULL,
  demand_id TEXT NOT NULL UNIQUE,
  request_started INTEGER NOT NULL DEFAULT 0 CHECK (request_started IN (0, 1)),
  shared_state_hash BLOB,
  state TEXT NOT NULL CHECK (state IN ('pending', 'verified_present', 'no_longer_required')),
  transfer_id BLOB,
  CHECK ((request_started = 0 AND shared_state_hash IS NULL) OR
    (request_started = 1 AND shared_state_hash IS NOT NULL AND length(shared_state_hash) = 32)),
  CHECK ((state = 'verified_present' AND transfer_id IS NOT NULL) OR
    (state != 'verified_present' AND transfer_id IS NULL)),
  PRIMARY KEY (group_id, receiver_device_id, receiver_library_epoch,
    global_id, version_id, body_hash, storage_key))`;
