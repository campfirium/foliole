import type Database from 'better-sqlite3';

export function installCompanionFramedSyncStaging(
  database: Database.Database,
  prefix: string
) {
  database.exec(`CREATE TABLE ${prefix}_transfers (
      transfer_id BLOB PRIMARY KEY, content_id BLOB NOT NULL,
      sender_device_id TEXT NOT NULL, sender_library_epoch TEXT NOT NULL,
      receiver_device_id TEXT NOT NULL, receiver_library_epoch TEXT NOT NULL,
      active_attempt_id BLOB NOT NULL, state TEXT NOT NULL);
    CREATE TABLE ${prefix}_frames (
      transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sequence TEXT NOT NULL,
      frame_type INTEGER NOT NULL, authenticated_plaintext BLOB NOT NULL);
    CREATE TABLE ${prefix}_available_blobs (
      sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL, data BLOB NOT NULL);
    CREATE TABLE ${prefix}_blob_pins (
      transfer_id BLOB NOT NULL, sha256 BLOB NOT NULL, byte_length INTEGER NOT NULL,
      role INTEGER NOT NULL, required INTEGER NOT NULL);
    CREATE TABLE ${prefix}_available_resources (
      sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL, storage_key TEXT NOT NULL);
    CREATE TABLE ${prefix}_resource_pins (
      transfer_id BLOB NOT NULL, sha256 BLOB NOT NULL, byte_length INTEGER NOT NULL,
      role INTEGER NOT NULL, required INTEGER NOT NULL, storage_key TEXT NOT NULL);`);
}
