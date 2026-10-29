import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import { recordFramedSyncResourceAvailability } from '../database/framedSyncResourceAvailability.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';

import type { AttachmentReferenceInput, AttachmentReferenceResult } from './attachmentReferenceInputs.js';

const sourceJoin = `FROM nodes n LEFT JOIN attachment_reference_cache cached ON cached.node_id = n.id`;
const incompleteInput = `n.content IS NULL OR (n.body_blob_hash IS NULL AND n.content <> '')`;
const changedInput = `cached.node_id IS NULL OR cached.body_hash IS NOT n.body_blob_hash
  OR cached.resources_json IS NOT n.resource_references OR ${incompleteInput}`;

/** Runs in a host-owned short read snapshot. Only changed bodies cross the database boundary. */
export async function readAttachmentReferenceInputs(db: DbPort, after: string | null, maxRows = 128,
  maxBytes = 1024 * 1024): Promise<AttachmentReferenceInput[]> {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 128 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('attachment_scan_batch_invalid');
  }
  const candidates = await db.query<{ id: string; bytes: number }>(`SELECT n.id,
    COALESCE(length(CAST(n.content AS BLOB)), 0) + length(CAST(n.resource_references AS BLOB)) AS bytes
    ${sourceJoin} WHERE (${changedInput}) AND (? IS NULL OR n.id > ?) ORDER BY n.id LIMIT ?`, [after, after, maxRows]);
  const ids: string[] = [];
  let bytes = 0;
  for (const row of candidates) {
    if (ids.length && bytes + row.bytes > maxBytes) break;
    ids.push(row.id);
    bytes += row.bytes;
  }
  if (!ids.length) return [];
  return db.query<AttachmentReferenceInput & DbRow>(`SELECT id, content, body_blob_hash AS body_hash,
    resource_references AS resources_json FROM nodes WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id`,
  [JSON.stringify(ids)]);
}

/** A late result can neither resurrect a deleted node nor claim a newer input was scanned. */
export async function saveAttachmentReferenceResults(db: DbPort, results: readonly AttachmentReferenceResult[]) {
  return db.transaction(async tx => {
    let saved = 0;
    for (const row of results) {
      if (row.storageKeys.some(key => !parseCanonicalAttachmentStorageKey(key))) throw new Error('attachment_scan_key_invalid');
      const result = await tx.run(`INSERT INTO attachment_reference_cache
        (node_id, body_hash, resources_json, storage_keys_json)
        SELECT id, ?, ?, ? FROM nodes WHERE id = ? AND body_blob_hash IS ?
          AND resource_references IS ? AND content IS NOT NULL
          AND (body_blob_hash IS NOT NULL OR content = '')
        ON CONFLICT(node_id) DO UPDATE SET body_hash = excluded.body_hash,
          resources_json = excluded.resources_json, storage_keys_json = excluded.storage_keys_json`,
      [row.body_hash, row.resources_json, JSON.stringify(row.storageKeys), row.id, row.body_hash, row.resources_json]);
      saved += result.changes;
    }
    return saved;
  });
}

/** Call and consume the result inside the same writer fact boundary as the observation revision. */
export async function readCompleteAttachmentReferenceKeys(db: DbPort): Promise<string[] | null> {
  const pending = await db.query(`SELECT 1 ${sourceJoin} WHERE ${changedInput} LIMIT 1`);
  if (pending.length) return null;
  const rows = await db.query<{ storage_key: string }>(`SELECT DISTINCT reference.value AS storage_key
    FROM attachment_reference_cache cached JOIN nodes n ON n.id = cached.node_id,
      json_each(cached.storage_keys_json) reference ORDER BY storage_key`);
  const keys = rows.map(row => row.storage_key);
  if (keys.some(key => !parseCanonicalAttachmentStorageKey(key))) throw new Error('attachment_scan_key_invalid');
  return keys;
}

/** Observer-side lookup only: the existing sync queue still parses adopted content when consumed. */
export async function requeueMissingObservedAttachments(db: DbPort, storageKeys: readonly string[]) {
  if (!storageKeys.length) return;
  await db.run(`INSERT INTO attachment_parse_queue(article_id, registered_at)
    SELECT DISTINCT cached.node_id, ? FROM attachment_reference_cache cached
      JOIN nodes n ON n.id = cached.node_id, json_each(cached.storage_keys_json) reference
    WHERE n.deleted_at IS NULL AND reference.value IN (SELECT value FROM json_each(?))
    ON CONFLICT(article_id) DO NOTHING`, [new Date().toISOString(), JSON.stringify(storageKeys)]);
  await recordFramedSyncResourceAvailability(db, storageKeys.map(key => key.slice(0, 64)), false);
}
