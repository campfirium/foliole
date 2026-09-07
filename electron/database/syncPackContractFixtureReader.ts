import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export function readSyncPackContractRows(packPath: string, tempRoot: string) {
  const entries = readStoredZipEntries(packPath);
  const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}');
  const incomingPath = path.join(tempRoot, 'read-incoming.db');
  fs.writeFileSync(incomingPath, inflateSync(entries.get('incoming.db.deflate') ?? Buffer.alloc(0)));
  const db = new BetterSqlite3(incomingPath, { readonly: true });
  try {
    return {
      externalDocuments: db.prepare('SELECT document_id, content, body_blob_hash FROM external_documents').all(),
      importSources: db.prepare(`SELECT
        json_extract(payload_json, '$.source_fingerprint') source_fingerprint,
        json_extract(payload_json, '$.source_locator') source_locator,
        json_extract(payload_json, '$.source_location') source_location,
        json_extract(payload_json, '$.remote_provider') remote_provider,
        json_extract(payload_json, '$.remote_connection_ref') remote_connection_ref,
        json_extract(payload_json, '$.remote_document_id') remote_document_id,
        json_extract(payload_json, '$.remote_annotations_json') remote_annotations_json
        FROM sync_objects WHERE object_type = 'import_source'`).all(),
      manifest,
      nodeAttachments: db.prepare('SELECT node_id, attachment_id, role FROM node_attachments').all(),
      nodeVersions: db.prepare(
        'SELECT version_id, object_id, parent_version_id, host_name, content_hash, snapshot_json FROM node_sync_versions'
      ).all(),
      nodeOrder: db.prepare('SELECT node_id, position FROM node_order').all(),
      nodes: db.prepare(
        `SELECT id, priority, desired_retention, enable_short_term, sequential_reading_enabled,
                manual_child_order, virtual_filter, anchor_link, image_regions,
                import_source_fingerprint, import_content_fingerprint,
                content, body_blob_hash, opening_text, reveal FROM nodes`
      ).all()
    };
  } finally {
    db.close();
  }
}

function readStoredZipEntries(filePath: string) {
  const buffer = fs.readFileSync(filePath);
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
