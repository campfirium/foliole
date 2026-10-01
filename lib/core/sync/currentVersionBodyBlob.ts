import { CONTENT_BLOB_BATCH_MAX_BYTES } from '../../platform/resourceAvailabilityContract.js';

import type { DbPort, DbParams } from './dbPort.js';
import { refreshNodeInlineBodiesForHashes } from './nodeInlineBodyProjection.js';
import { hashTextBodyContent } from './syncNodeTextBodyBlobs.js';

type BodyScope = { hashes: readonly string[] } | { incomingAlias: string };
interface CurrentBodyRow {
  [key: string]: unknown;
  id: string;
  current_version_id: string;
  hash: string;
  body: string;
  stored_size_bytes: number;
}

const VERSION_BODY = `CASE WHEN v.body_text IS NOT NULL THEN v.body_text
  WHEN json_type(v.snapshot_json, '$.content') = 'text'
    THEN json_extract(v.snapshot_json, '$.content') END`;

function scopeFilter(scope: BodyScope): { sql: string; params: DbParams } {
  if ('hashes' in scope) return {
    sql: 'cb.hash IN (SELECT value FROM json_each(?))', params: [JSON.stringify(scope.hashes)]
  };
  const alias = `"${scope.incomingAlias.replaceAll('"', '""')}"`;
  return { sql: `n.id IN (SELECT id FROM ${alias}.nodes)`, params: [] };
}

/** Caller owns the transaction: publish verified bytes and availability together. */
export async function materializeCurrentVersionBodyBlobs(port: DbPort, scope: BodyScope) {
  const filter = scopeFilter(scope);
  let after = '';
  let count = 0;
  for (;;) {
    const [row] = await port.query<CurrentBodyRow>(currentBodySql(filter.sql),
      [after, ...filter.params, CONTENT_BLOB_BATCH_MAX_BYTES]);
    if (!row) return count;
    after = row.id;
    if (!/^[a-f0-9]{64}$/u.test(row.hash)) continue;
    const bytes = new TextEncoder().encode(row.body);
    if (bytes.byteLength !== row.stored_size_bytes ||
        await hashTextBodyContent(row.body, {}) !== row.hash) continue;
    count += await persistCurrentBody(port, row, bytes);
  }
}

function currentBodySql(filter: string) {
  return `SELECT n.id, n.current_version_id, cb.hash, cb.stored_size_bytes,
      ${VERSION_BODY} AS body
    FROM main.nodes n
    JOIN main.node_sync_versions v ON v.version_id = n.current_version_id AND v.object_id = n.id
    JOIN main.sync_object_state s ON s.object_type = 'node' AND s.object_id = n.id
      AND s.current_version_id = v.version_id AND s.content_hash = v.content_hash
    JOIN main.content_blobs cb ON cb.hash = n.body_blob_hash
    LEFT JOIN main.content_blob_data data ON data.hash = cb.hash
    WHERE n.id > ? AND ${filter} AND data.hash IS NULL AND n.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM main.node_sync_tombstones t WHERE t.node_id = n.id)
      AND cb.kind = 'text_body' AND cb.mime_type = 'text/plain' AND cb.compression = 'none'
      AND cb.original_sha256 = cb.hash AND cb.stored_sha256 = cb.hash
      AND cb.original_size_bytes = cb.stored_size_bytes
      AND cb.stored_size_bytes BETWEEN 0 AND ?
      AND CASE WHEN json_valid(v.snapshot_json) THEN
        json_extract(v.snapshot_json, '$.id') = n.id
        AND (v.body_text IS NULL OR json_type(v.snapshot_json, '$.content') IS NOT 'text'
          OR json_extract(v.snapshot_json, '$.content') = v.body_text
          OR (json_extract(v.snapshot_json, '$.content') = ''
            AND json_extract(v.snapshot_json, '$.body_blob_hash') = cb.hash))
        AND length(CAST(${VERSION_BODY} AS BLOB)) = cb.stored_size_bytes
      ELSE 0 END
    ORDER BY n.id LIMIT 1`;
}

async function persistCurrentBody(port: DbPort, row: CurrentBodyRow, bytes: Uint8Array) {
  const inserted = await port.run(
    `INSERT INTO main.content_blob_data (hash, data)
     SELECT ?, ? WHERE EXISTS (SELECT 1 FROM main.nodes n
       JOIN main.node_sync_versions v ON v.version_id = n.current_version_id AND v.object_id = n.id
       WHERE n.id = ? AND n.current_version_id = ? AND n.body_blob_hash = ?)
     ON CONFLICT(hash) DO NOTHING`,
    [row.hash, bytes, row.id, row.current_version_id, row.hash]);
  if (!inserted.changes) return 0;
  const now = new Date().toISOString();
  const updated = await port.run(
    `UPDATE main.content_blobs SET availability = 'cached', cached_at = ?, last_verified_at = ?
     WHERE hash = ? AND stored_sha256 = ? AND original_sha256 = ?
       AND stored_size_bytes = ? AND original_size_bytes = ?
       AND kind = 'text_body' AND mime_type = 'text/plain' AND compression = 'none'`,
    [now, now, row.hash, row.hash, row.hash, bytes.byteLength, bytes.byteLength]);
  if (updated.changes !== 1) throw new Error('sync_current_body_manifest_changed');
  await refreshNodeInlineBodiesForHashes(port, [row.hash]);
  return 1;
}
