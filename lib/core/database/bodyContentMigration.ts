import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { stageBodyContent } from '../sync/bodyContentWrite.js';
import type { DbPort } from '../sync/dbPort.js';

import { BODY_CONTENT_CHUNK_BYTES, BODY_CONTENT_SCHEMA } from './bodyContentSchema.js';

const VERSION_BODY = `COALESCE(body_text, CASE WHEN json_type(snapshot_json, '$.content') = 'text'
  THEN json_extract(snapshot_json, '$.content') END)`;

type BodySource =
  | Readonly<{ kind: 'continuous'; hash: string }>
  | Readonly<{ kind: 'version'; rowid: number }>;

function sourceQuery(source: BodySource) {
  return source.kind === 'continuous'
    ? { sql: 'SELECT substr(CAST(data AS BLOB), ?, ?) AS data FROM content_blob_data WHERE hash = ?', key: source.hash }
    : { sql: `SELECT substr(CAST(${VERSION_BODY} AS BLOB), ?, ?) AS data FROM node_sync_versions WHERE rowid = ?`,
      key: source.rowid };
}

async function* sourceChunks(db: DbPort, source: BodySource, size: number) {
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

async function sourceHash(db: DbPort, source: BodySource, size: number) {
  const hash = sha256.create();
  try {
    for await (const chunk of sourceChunks(db, source, size)) hash.update(chunk);
    return bytesToHex(hash.digest());
  } finally { hash.destroy(); }
}

async function migrateContinuousBodies(db: DbPort) {
  let after = '';
  for (;;) {
    const [row] = await db.query<{ hash: string; size: number; original_size_bytes: number;
      stored_size_bytes: number; original_sha256: string; stored_sha256: string; compression: string }>(
      `SELECT blob.hash, length(CAST(data.data AS BLOB)) AS size, blob.original_size_bytes,
        blob.stored_size_bytes, blob.original_sha256, blob.stored_sha256, blob.compression
       FROM content_blobs blob JOIN content_blob_data data ON data.hash = blob.hash
       WHERE blob.kind = 'text_body' AND blob.hash > ? ORDER BY blob.hash LIMIT 1`, [after]);
    if (!row) return;
    if (row.original_size_bytes !== row.size || row.stored_size_bytes !== row.size ||
        row.original_sha256 !== row.hash || row.stored_sha256 !== row.hash || row.compression !== 'none') {
      throw new Error('body_migration_manifest_mismatch');
    }
    await stageBodyContent(db, { hash: row.hash, byteLength: row.size,
      chunks: sourceChunks(db, { kind: 'continuous', hash: row.hash }, row.size) });
    await db.run('DELETE FROM content_blob_data WHERE hash = ?', [row.hash]);
    after = row.hash;
  }
}

async function migrateVersionBodies(db: DbPort) {
  await db.run(`ALTER TABLE node_sync_versions ADD COLUMN body_state TEXT NOT NULL DEFAULT 'unavailable'
    CHECK (body_state IN ('readable', 'retired', 'unavailable'))`);
  await db.run('ALTER TABLE node_sync_versions ADD COLUMN body_blob_hash TEXT');
  let after = 0;
  for (;;) {
    const [row] = await db.query<{ rowid: number; size: number | null; body_hash: string | null;
      deleted_at: string | null }>(
      `SELECT rowid, length(CAST(${VERSION_BODY} AS BLOB)) AS size,
        json_extract(snapshot_json, '$.body_blob_hash') AS body_hash,
        json_extract(snapshot_json, '$.deleted_at') AS deleted_at
       FROM node_sync_versions WHERE rowid > ? ORDER BY rowid LIMIT 1`, [after]);
    if (!row) return;
    after = row.rowid;
    if (row.size === null) {
      await db.run('UPDATE node_sync_versions SET body_state = ?, body_blob_hash = ? WHERE rowid = ?',
        [row.body_hash === null ? 'retired' : 'unavailable', row.body_hash, row.rowid]);
      continue;
    }
    const source: BodySource = { kind: 'version', rowid: row.rowid };
    const hash = await sourceHash(db, source, row.size);
    if (row.body_hash !== null && row.body_hash !== hash) {
      if (row.size !== 0 || row.deleted_at === null) throw new Error('body_migration_version_hash_mismatch');
      await db.run(`UPDATE node_sync_versions SET body_text = NULL, body_state = 'unavailable', body_blob_hash = ?,
        snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE rowid = ?`, [row.body_hash, row.rowid]);
      continue;
    }
    await stageBodyContent(db, { hash, byteLength: row.size, chunks: sourceChunks(db, source, row.size) });
    await db.run(`UPDATE node_sync_versions SET body_text = NULL, body_state = 'readable', body_blob_hash = ?,
      snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_blob_hash', ?) WHERE rowid = ?`,
    [hash, hash, row.rowid]);
  }
}

/** Formal schema upgrade only. Register after all readers and writers consume stable references. */
export async function migrateBodyContentStorage(db: DbPort) {
  await db.transaction(async (tx) => {
    for (const sql of BODY_CONTENT_SCHEMA) await tx.run(sql);
    await migrateContinuousBodies(tx);
    await migrateVersionBodies(tx);
  });
}
