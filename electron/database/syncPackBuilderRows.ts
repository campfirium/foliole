import { buildSyncPackManifest } from '../../lib/core/sync/syncPackManifest.js';
import { SYNC_PACK_NODE_COLUMNS } from '../../lib/core/sync/syncPackNodeFields.js';
import { SYNC_PACK_NODE_VERSION_COLUMNS } from '../../lib/core/sync/syncPackNodeVersions.js';

import type { LoadedDesktopSyncPackRows } from './syncPackLoadedRows.js';

interface BuildDesktopSyncPackRowsInput {
  fromStateSeq: number;
  packId: string;
  toPeerId?: string;
}

function placeholders(values: unknown[]) {
  return values.map(() => '?').join(', ');
}

function copyRows<T extends object>(args: {
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
    statement.run(...(args.values
      ? args.values(row)
      : args.columns.map((column) => (row as Record<string, unknown>)[column])));
  }
}

export function writePackManifest(
  db: import('better-sqlite3').Database,
  input: BuildDesktopSyncPackRowsInput,
  fromStateSeq: number,
  toStateSeq: number,
  rows: LoadedDesktopSyncPackRows
) {
  db.prepare('INSERT INTO pack_manifest (key, value) VALUES (?, ?)').run('manifest_json', JSON.stringify(
    buildSyncPackManifest({
      fromStateSeq,
      packId: input.packId,
      tableRows: {
        content_blobs: rows.contentBlobs,
        external_documents: rows.externalDocuments,
        node_attachments: rows.nodeAttachments,
        node_order: rows.nodeOrder,
        node_sync_versions: rows.nodeVersions,
        node_sync_version_parents: rows.nodeVersionParents,
        nodes: rows.nodes,
        review_log: rows.reviewLog,
        sync_object_state: rows.stateRows,
        sync_objects: rows.syncObjects
      },
      toStateSeq
    })
  ));
}

export function writePackRows(db: import('better-sqlite3').Database, rows: LoadedDesktopSyncPackRows) {
  writeCorePackRows(db, rows);
  writeNodePackRows(db, rows);
  writeDocumentPackRows(db, rows);
  writeReviewPackRows(db, rows);
}

function writeCorePackRows(db: import('better-sqlite3').Database, rows: LoadedDesktopSyncPackRows) {
  copyRows({
    db,
    table: 'sync_object_state',
    columns: ['object_type', 'object_id', 'state_seq', 'content_hash', 'updated_at', 'deleted_at'],
    rows: rows.stateRows
  });
  copyRows({
    db,
    table: 'sync_objects',
    columns: ['object_type', 'object_id', 'content_hash', 'payload_json', 'updated_at', 'deleted_at'],
    rows: rows.syncObjects
  });
}

function writeNodePackRows(db: import('better-sqlite3').Database, rows: LoadedDesktopSyncPackRows) {
  copyRows({
    db,
    table: 'node_sync_versions',
    columns: [...SYNC_PACK_NODE_VERSION_COLUMNS],
    rows: rows.nodeVersions
  });
  copyRows({
    db,
    table: 'node_sync_version_parents',
    columns: ['version_id', 'parent_version_id', 'ordinal'],
    rows: rows.nodeVersionParents
  });
  copyRows({
    db,
    table: 'nodes',
    columns: SYNC_PACK_NODE_COLUMNS,
    rows: rows.nodes,
    values: (row) => SYNC_PACK_NODE_COLUMNS.map((column) => column === 'content' ? '' : row[column])
  });
  copyRows({
    db,
    table: 'node_order',
    columns: ['node_id', 'position'],
    rows: rows.nodeOrder
  });
  copyRows({
    db,
    table: 'node_attachments',
    columns: ['node_id', 'attachment_id', 'role'],
    rows: rows.nodeAttachments
  });
}

function writeDocumentPackRows(db: import('better-sqlite3').Database, rows: LoadedDesktopSyncPackRows) {
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

function writeReviewPackRows(db: import('better-sqlite3').Database, rows: LoadedDesktopSyncPackRows) {
  copyRows({
    db,
    table: 'review_log',
    columns: [
      'id', 'op_id', 'device_id', 'node_id', 'grade', 'scheduler_version', 'reviewed_at',
      'due_before', 'stability_before', 'difficulty_before', 'due_after', 'stability_after', 'difficulty_after'
    ],
    rows: rows.reviewLog
  });
}
