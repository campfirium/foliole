import type { SqliteDatabase } from '../../electron/database/connection.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalExternalDocumentPayload } from '../../lib/core/sync/canonicalExternalResourcePayload.js';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';

export function canonicalizeOracleExternalDocumentHashes(database: SqliteDatabase) {
  const rows = database.prepare(`SELECT document_id, folder_id, relative_path, file_name,
    extension, content_hash, title, body_blob_hash, reference_kind, reference_json
    FROM oracle_seed.external_documents`).all() as ExternalDocumentRow[];
  const update = database.prepare(`UPDATE oracle_seed.sync_object_state SET content_hash = ?
    WHERE object_type = 'external_document' AND object_id = ?`);
  for (const row of rows) {
    const contentHash = computeSyncContentHash('external_document',
      buildCanonicalExternalDocumentPayload(row));
    update.run(contentHash, row.document_id);
  }
}

export function canonicalizeOracleSettingPayloads(database: SqliteDatabase) {
  const rows = database.prepare(
    "SELECT object_id, payload_json FROM oracle_seed.sync_objects WHERE object_type = 'setting'"
  ).all() as Array<{ object_id: string; payload_json: string }>;
  const updateObject = database.prepare(`UPDATE oracle_seed.sync_objects
    SET content_hash = ?, payload_json = ? WHERE object_type = 'setting' AND object_id = ?`);
  const updateState = database.prepare(`UPDATE oracle_seed.sync_object_state
    SET content_hash = ? WHERE object_type = 'setting' AND object_id = ?`);
  for (const row of rows) {
    const payload = buildCanonicalSettingSyncPayload(JSON.parse(row.payload_json));
    const contentHash = computeSyncContentHash('setting', payload);
    updateObject.run(contentHash, JSON.stringify(payload), row.object_id);
    updateState.run(contentHash, row.object_id);
  }
}

interface ExternalDocumentRow {
  body_blob_hash: string | null;
  content_hash: string;
  document_id: string;
  extension: string;
  file_name: string;
  folder_id: string;
  reference_json: string | null;
  reference_kind: string;
  relative_path: string;
  title: string;
}
