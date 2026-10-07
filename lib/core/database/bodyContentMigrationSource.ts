import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../sync/dbPort.js';

import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';

export const VERSION_BODY_MIGRATION_SQL = `COALESCE(body_text, CASE WHEN json_type(snapshot_json, '$.content') = 'text'
  THEN json_extract(snapshot_json, '$.content') END)`;

export type BodyMigrationSource =
  | Readonly<{ kind: 'continuous'; hash: string }>
  | Readonly<{ kind: 'version'; rowid: number }>
  | Readonly<{ kind: 'node'; id: string }>;

function sourceQuery(source: BodyMigrationSource) {
  if (source.kind === 'continuous') return {
    sql: 'SELECT substr(CAST(data AS BLOB), ?, ?) AS data FROM content_blob_data WHERE hash = ?', key: source.hash
  };
  if (source.kind === 'node') return {
    sql: 'SELECT substr(CAST(content AS BLOB), ?, ?) AS data FROM nodes WHERE id = ?', key: source.id
  };
  return { sql: `SELECT substr(CAST(${VERSION_BODY_MIGRATION_SQL} AS BLOB), ?, ?) AS data
    FROM node_sync_versions WHERE rowid = ?`, key: source.rowid };
}

export async function* bodyMigrationSourceChunks(db: DbPort, source: BodyMigrationSource, size: number) {
  const query = sourceQuery(source);
  for (let offset = 0; offset < size; offset += BODY_CONTENT_CHUNK_BYTES) {
    const length = Math.min(BODY_CONTENT_CHUNK_BYTES, size - offset);
    const [row] = await db.query<{ data: Uint8Array }>(query.sql, [offset + 1, length, query.key]);
    if (!row || !(row.data instanceof Uint8Array) || row.data.byteLength !== length) {
      throw new Error('body_migration_source_unavailable');
    }
    yield row.data;
  }
}

export async function bodyMigrationSourceHash(db: DbPort, source: BodyMigrationSource, size: number) {
  const hash = sha256.create();
  try {
    for await (const chunk of bodyMigrationSourceChunks(db, source, size)) hash.update(chunk);
    return bytesToHex(hash.digest());
  } finally { hash.destroy(); }
}
