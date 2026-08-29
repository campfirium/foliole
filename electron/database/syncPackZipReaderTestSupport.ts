import fsSync from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export function readPackRowsFromZip(packPath: string, tempRoot: string) {
  const entries = readStoredZipEntries(packPath);
  const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}');
  const incomingBytes = inflateSync(entries.get('incoming.db.deflate') ?? Buffer.alloc(0));
  const incomingPath = path.join(tempRoot, 'read-incoming.db');
  fsSync.writeFileSync(incomingPath, incomingBytes);
  const db = new BetterSqlite3(incomingPath, { readonly: true });
  try {
    return {
      blobDataTable: db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content_blob_data'").get(),
      blobs: db.prepare('SELECT hash, kind FROM content_blobs').all(),
      externalDocuments: db.prepare('SELECT document_id, content, body_blob_hash, opening_text FROM external_documents').all(),
      groupDevices: db.prepare('SELECT * FROM sync_group_devices').all(),
      groups: db.prepare('SELECT * FROM sync_groups').all(),
      innerManifest: JSON.parse(String(db.prepare(
        "SELECT value FROM pack_manifest WHERE key = 'manifest_json'"
      ).pluck().get())),
      manifest,
      nodeAttachments: db.prepare('SELECT node_id, attachment_id, role FROM node_attachments').all(),
      nodeVersionParents: db.prepare(
        'SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents ORDER BY version_id, ordinal'
      ).all(),
      nodeVersions: db.prepare(
        `SELECT version_id, object_id, parent_version_id, host_name, created_at, body_text, content_hash, snapshot_json
         FROM node_sync_versions ORDER BY created_at, version_id`
      ).all(),
      nodes: db.prepare('SELECT id, content, body_blob_hash, opening_text, reveal, current_version_id FROM nodes').all(),
      reviewLog: db.prepare('SELECT op_id, node_id, grade FROM review_log').all(),
      stateRows: db.prepare('SELECT object_type, object_id, state_seq FROM sync_object_state').all(),
      syncObjects: db.prepare('SELECT object_type, object_id, payload_json FROM sync_objects').all(),
      tableNames: db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .pluck().all()
    };
  } finally {
    db.close();
  }
}

export function readStoredZipEntries(filePath: string) {
  const buffer = fsSync.readFileSync(filePath);
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + fileNameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
    entries.set(name, buffer.subarray(contentStart, contentStart + compressedSize));
    offset = contentStart + compressedSize;
  }
  return entries;
}
