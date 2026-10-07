import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';

const SCOPES = {
  desktop: ['main', 'framed_sync', 'framed_sync_inbound_transfers'],
  android: ['framed_android', 'framed_sync_android', 'framed_sync_android_transfers'],
  ios: ['framed_ios', 'framed_sync_ios', null]
} as const;
export type AvailableBlobScope = keyof typeof SCOPES;

export function availableBlobTables(scope: AvailableBlobScope) {
  if (!Object.hasOwn(SCOPES, scope)) throw new Error('framed_sync_available_scope_invalid');
  const [schema, prefix, transfers] = SCOPES[scope];
  return { available: `${schema}.${prefix}_available_blobs`, chunks: `${schema}.${prefix}_available_blob_chunks`,
    headerName: `${prefix}_available_blobs`, pins: `${schema}.${prefix}_blob_pins`, transfers,
    oldPinsName: `${prefix}_blob_pins_continuous_upgrade`, oldPins: `${schema}.${prefix}_blob_pins_continuous_upgrade`,
    oldAvailableName: `${prefix}_available_blobs_continuous_upgrade`,
    oldAvailable: `${schema}.${prefix}_available_blobs_continuous_upgrade` };
}

export function availableBlobChunkSchema(scope: AvailableBlobScope) {
  const tables = availableBlobTables(scope);
  return `CREATE TABLE ${tables.chunks} (
    sha256 BLOB NOT NULL REFERENCES ${tables.headerName}(sha256) ON DELETE CASCADE,
    byte_offset INTEGER NOT NULL CHECK (byte_offset >= 0 AND byte_offset % ${BODY_CONTENT_CHUNK_BYTES} = 0),
    data BLOB NOT NULL CHECK (typeof(data) = 'blob' AND length(data) BETWEEN 1 AND ${BODY_CONTENT_CHUNK_BYTES}),
    PRIMARY KEY (sha256, byte_offset))`;
}

export function availableBlobRebuildStatements(scope: AvailableBlobScope) {
  const table = availableBlobTables(scope);
  const checked = scope === 'desktop';
  const foreignKeys = table.transfers === null ? '' : `,
    FOREIGN KEY (transfer_id) REFERENCES ${table.transfers}(transfer_id) ON DELETE CASCADE,
    FOREIGN KEY (sha256) REFERENCES ${table.headerName}(sha256)`;
  return [
    `ALTER TABLE ${table.pins} RENAME TO ${table.oldPinsName}`,
    `ALTER TABLE ${table.available} RENAME TO ${table.oldAvailableName}`,
    `CREATE TABLE ${table.available} (sha256 BLOB PRIMARY KEY,
      byte_length INTEGER NOT NULL${checked ? ' CHECK (byte_length >= 0)' : ''})`,
    `INSERT INTO ${table.available} (sha256, byte_length) SELECT sha256, byte_length FROM ${table.oldAvailable}`,
    `CREATE TABLE ${table.pins} (transfer_id BLOB NOT NULL, sha256 BLOB NOT NULL,
      byte_length INTEGER NOT NULL${checked ? ' CHECK (byte_length >= 0)' : ''}, role INTEGER NOT NULL,
      required INTEGER NOT NULL${checked ? ' CHECK (required IN (0, 1))' : ''},
      PRIMARY KEY (transfer_id, sha256)${foreignKeys})`,
    `INSERT INTO ${table.pins} (transfer_id, sha256, byte_length, role, required)
      SELECT transfer_id, sha256, byte_length, role, required FROM ${table.oldPins}`,
    availableBlobChunkSchema(scope)
  ];
}
