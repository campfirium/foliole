import { createHash } from 'node:crypto';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

function tableExists(sqlite: DatabaseMigrationTarget, tableName: string) {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(tableName)[0] as { name?: string } | undefined;
  return row?.name === tableName;
}

function sha256Hex(text: string) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function byteLength(text: string) {
  return Buffer.byteLength(text, 'utf8');
}

export function backfillTextBodyBlobOwners(sqlite: DatabaseMigrationTarget) {
  backfillTextBodyBlobHashes(sqlite, {
    bodyHashColumn: 'body_blob_hash',
    contentColumn: 'content',
    idColumn: 'id',
    kind: 'text_body',
    tableName: 'nodes',
    updatedAtColumn: 'updated_at'
  });
  backfillTextBodyBlobHashes(sqlite, {
    bodyHashColumn: 'body_blob_hash',
    contentColumn: 'content',
    idColumn: 'document_id',
    kind: 'text_body',
    tableName: 'external_documents',
    updatedAtColumn: 'updated_at'
  });
}

function backfillTextBodyBlobHashes(sqlite: DatabaseMigrationTarget, args: {
  bodyHashColumn: string;
  contentColumn: string;
  idColumn: string;
  kind: string;
  tableName: string;
  updatedAtColumn: string;
}) {
  if (!tableExists(sqlite, args.tableName)) return;
  const rows = sqlite
    .prepare(
      `SELECT ${args.idColumn} AS id, ${args.contentColumn} AS content, ${args.updatedAtColumn} AS updated_at
       FROM ${args.tableName}
       WHERE ${args.bodyHashColumn} IS NULL AND ${args.contentColumn} IS NOT NULL`
    )
    .all() as Array<{ content: string; id: string; updated_at: string }>;
  const insertBlob = sqlite.prepare(
    `INSERT INTO content_blobs (
       hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes,
       original_sha256, stored_sha256, availability, created_at, cached_at, last_verified_at
     ) VALUES (?, ?, ?, 'text/plain', 'none', ?, ?, ?, ?, 'local', ?, ?, ?)
     ON CONFLICT(hash) DO NOTHING`
  );
  const updateOwner = sqlite.prepare(`UPDATE ${args.tableName} SET ${args.bodyHashColumn} = ? WHERE ${args.idColumn} = ?`);

  for (const row of rows) {
    const hash = sha256Hex(row.content);
    const size = byteLength(row.content);
    const timestamp = row.updated_at;
    insertBlob.run(hash, `text/${hash}`, args.kind, size, size, hash, hash, timestamp, timestamp, timestamp);
    updateOwner.run(hash, row.id);
  }
}

export function backfillTextBodyBlobData(sqlite: DatabaseMigrationTarget, args: {
  bodyHashColumn: string;
  contentColumn: string;
  tableName: string;
}) {
  if (!tableExists(sqlite, args.tableName)) return;
  const rows = sqlite
    .prepare(
      `SELECT ${args.bodyHashColumn} AS hash, ${args.contentColumn} AS content
       FROM ${args.tableName}
       WHERE ${args.bodyHashColumn} IS NOT NULL AND ${args.contentColumn} IS NOT NULL`
    )
    .all() as Array<{ content: string; hash: string }>;
  const insertData = sqlite.prepare(
    `INSERT INTO content_blob_data (hash, data)
     VALUES (?, ?)
     ON CONFLICT(hash) DO NOTHING`
  );

  for (const row of rows) {
    insertData.run(row.hash, Buffer.from(row.content, 'utf8'));
  }
}
