import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/migrations.js';
import { writeStoredZip } from '../diagnostics/zipStore.js';

import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { buildSyncPackManifest } from './syncPackManifest.js';
import { loadMaxStateSeq, loadPackRows, type LoadedSyncPackRows } from './syncPackRows.js';
import { PACK_SCHEMA } from './syncPackSchema.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

interface BuildDesktopSyncPackInput {
  createdAt?: string;
  fromDeviceId?: string;
  outputPath: string;
  packId: string;
  fromStateSeq: number;
  toPeerId?: string;
  toStateSeq?: number;
}

function normalizeSeq(value: number) {
  return Math.max(0, Math.trunc(value));
}

function placeholders(values: unknown[]) {
  return values.map(() => '?').join(', ');
}

function copyRows<T extends DatabaseRow>(args: {
  columns: string[];
  db: import('better-sqlite3').Database;
  rows: T[];
  table: string;
  values?: (row: T) => unknown[];
}) {
  if (args.rows.length === 0) return;
  const sql = `INSERT INTO ${args.table} (${args.columns.join(', ')}) VALUES (${placeholders(args.columns)})`;
  const statement = args.db.prepare(sql);
  for (const row of args.rows) {
    statement.run(...(args.values ? args.values(row) : args.columns.map((column) => row[column])));
  }
}

function writePackManifest(
  db: import('better-sqlite3').Database,
  input: BuildDesktopSyncPackInput,
  fromStateSeq: number,
  toStateSeq: number,
  rows: LoadedSyncPackRows
) {
  db.prepare('INSERT INTO pack_manifest (key, value) VALUES (?, ?)').run('manifest_json', JSON.stringify(
    buildSyncPackManifest({
      fromStateSeq,
      packId: input.packId,
      tableRows: {
        content_blobs: rows.contentBlobs,
        external_documents: rows.externalDocuments,
        nodes: rows.nodes,
        sync_object_state: rows.stateRows
      },
      toStateSeq
    })
  ));
}

function writePackRows(db: import('better-sqlite3').Database, rows: LoadedSyncPackRows) {
  copyRows({
    db,
    table: 'sync_object_state',
    columns: ['object_type', 'object_id', 'state_seq', 'content_hash', 'updated_at', 'deleted_at'],
    rows: rows.stateRows
  });
  copyRows({
    db,
    table: 'nodes',
    columns: ['id', 'parent_id', 'kind', 'title', 'is_title_manual', 'hide_title_heading',
      'body_blob_hash', 'content', 'created_at', 'updated_at', 'deleted_at'],
    rows: rows.nodes,
    values: (row) => [row.id, row.parent_id, row.kind, row.title, row.is_title_manual,
      row.hide_title_heading, row.body_blob_hash, '', row.created_at, row.updated_at, row.deleted_at]
  });
  copyRows({
    db,
    table: 'external_documents',
    columns: ['document_id', 'folder_id', 'relative_path', 'file_name', 'extension', 'source_size_bytes',
      'source_modified_at', 'source_modified_ms', 'content_hash', 'title', 'opening_text', 'body_blob_hash',
      'content', 'indexed_at', 'is_present', 'missing_at', 'created_at', 'updated_at'],
    rows: rows.externalDocuments,
    values: (row) => [row.document_id, row.folder_id, row.relative_path, row.file_name, row.extension,
      row.source_size_bytes, row.source_modified_at, row.source_modified_ms, row.content_hash, row.title,
      row.opening_text, row.body_blob_hash, '', row.indexed_at, row.is_present, row.missing_at,
      row.created_at, row.updated_at]
  });
  copyRows({
    db,
    table: 'content_blobs',
    columns: ['hash', 'storage_key', 'kind', 'mime_type', 'compression', 'original_size_bytes',
      'stored_size_bytes', 'original_sha256', 'stored_sha256', 'availability', 'source_device_id',
      'created_at', 'cached_at', 'last_verified_at'],
    rows: rows.contentBlobs
  });
}

function sha256Uri(buffer: Buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function buildContainerManifest(args: {
  compressedBytes: Buffer;
  createdAt: string;
  fromDeviceId: string;
  fromStateSeq: number;
  input: BuildDesktopSyncPackInput;
  rows: LoadedSyncPackRows;
  toStateSeq: number;
  uncompressedBytes: Buffer;
}) {
  const innerManifest = buildSyncPackManifest({
    fromStateSeq: args.fromStateSeq,
    packId: args.input.packId,
    tableRows: {
      content_blobs: args.rows.contentBlobs,
      external_documents: args.rows.externalDocuments,
      nodes: args.rows.nodes,
      sync_object_state: args.rows.stateRows
    },
    toStateSeq: args.toStateSeq
  });
  return {
    format: 'foliole.sync-pack',
    format_version: 1,
    pack_id: args.input.packId,
    from_device_id: args.fromDeviceId,
    to_peer_id: args.input.toPeerId ?? '*',
    schema_version: DATABASE_SCHEMA_VERSION,
    from_state_seq: args.fromStateSeq,
    to_state_seq: args.toStateSeq,
    compression: 'zlib',
    database_file: 'incoming.db.deflate',
    database_uncompressed_sha256: sha256Uri(args.uncompressedBytes),
    database_compressed_sha256: sha256Uri(args.compressedBytes),
    tables: innerManifest.tables,
    created_at: args.createdAt
  };
}

export async function buildDesktopSyncPack(input: BuildDesktopSyncPackInput) {
  const fromStateSeq = normalizeSeq(input.fromStateSeq);
  const toStateSeq = normalizeSeq(input.toStateSeq ?? loadMaxStateSeq());
  const createdAt = input.createdAt ?? new Date().toISOString();
  const fromDeviceId = input.fromDeviceId ?? loadOrCreateDesktopDeviceId(createdAt);
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await fs.rm(input.outputPath, { force: true });

  const incomingPath = `${input.outputPath}.incoming.db`;
  await fs.rm(incomingPath, { force: true });
  const packDb = new BetterSqlite3(incomingPath);
  try {
    for (const statement of PACK_SCHEMA) {
      packDb.exec(statement);
    }
    const rows = loadPackRows(fromStateSeq, toStateSeq);
    const packToStateSeq = rows.stateRows.at(-1)?.state_seq ?? fromStateSeq;

    const writePack = packDb.transaction(() => {
      writePackManifest(packDb, input, fromStateSeq, packToStateSeq, rows);
      writePackRows(packDb, rows);
    });
    writePack();
    const uncompressedBytes = await fs.readFile(incomingPath);
    const compressedBytes = deflateSync(uncompressedBytes);
    const containerManifest = buildContainerManifest({
      compressedBytes,
      createdAt,
      fromDeviceId,
      fromStateSeq,
      input,
      rows,
      toStateSeq: packToStateSeq,
      uncompressedBytes
    });
    await writeStoredZip(input.outputPath, [
      { name: 'manifest.json', content: Buffer.from(JSON.stringify(containerManifest, null, 2), 'utf8') },
      { name: 'incoming.db.deflate', content: compressedBytes }
    ]);
    return {
      outputPath: input.outputPath,
      packId: input.packId,
      fromStateSeq,
      toStateSeq: packToStateSeq,
      objectCount: rows.stateRows.length,
      bodyBlobCount: rows.contentBlobs.length,
      manifest: containerManifest
    };
  } finally {
    packDb.close();
    await fs.rm(incomingPath, { force: true });
  }
}
