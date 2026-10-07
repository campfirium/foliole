import { assertBodyManifestIdentity, type BodyManifest } from '../database/bodyContentAdoption.js';

import type { BodyScope } from './currentVersionBodyBlob.js';
import type { DbParams, DbPort, DbRow } from './dbPort.js';
import { loadVerifiedBodyRef } from './verifiedBody.js';

interface CurrentVerifiedBody extends BodyManifest, DbRow { id: string; hash: string }

function scopedBodyFilter(scope: BodyScope): { sql: string; params: DbParams } {
  if ('hashes' in scope) return {
    sql: 'cb.hash IN (SELECT value FROM json_each(?))', params: [JSON.stringify(scope.hashes)]
  };
  const alias = `"${scope.incomingAlias.replaceAll('"', '""')}"`;
  return { sql: `n.id IN (SELECT id FROM ${alias}.nodes)`, params: [] };
}

/** Caller owns the transaction. Stable bytes are already verified; only cache metadata changes. */
export async function materializeCurrentVerifiedBodyBlobs(db: DbPort, scope: BodyScope) {
  const filter = scopedBodyFilter(scope);
  let after = '', count = 0;
  for (;;) {
    const [row] = await db.query<CurrentVerifiedBody>(`SELECT n.id, cb.hash, cb.original_sha256,
      cb.stored_sha256, cb.original_size_bytes, cb.stored_size_bytes, cb.compression
      FROM main.nodes n JOIN main.node_sync_versions v
        ON v.version_id = n.current_version_id AND v.object_id = n.id
      JOIN main.sync_object_state s ON s.object_type = 'node' AND s.object_id = n.id
        AND s.current_version_id = v.version_id AND s.content_hash = v.content_hash
      JOIN main.content_blobs cb ON cb.hash = n.body_blob_hash
      WHERE n.id > ? AND ${filter.sql} AND n.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM main.node_sync_tombstones t WHERE t.node_id = n.id)
        AND cb.kind = 'text_body' AND cb.mime_type = 'text/plain'
        AND v.body_state = 'readable' AND v.body_blob_hash = cb.hash
        AND CASE WHEN json_valid(v.snapshot_json)
          THEN json_extract(v.snapshot_json, '$.id') = n.id ELSE 0 END
        AND (cb.availability <> 'cached' OR cb.cached_at IS NULL OR cb.last_verified_at IS NULL)
      ORDER BY n.id LIMIT 1`, [after, ...filter.params]);
    if (!row) return count;
    after = row.id;
    const ref = await loadVerifiedBodyRef(db, row.hash);
    if (!ref) continue;
    assertBodyManifestIdentity(row, ref);
    const now = new Date().toISOString();
    const updated = await db.run(`UPDATE main.content_blobs SET availability = 'cached',
      cached_at = ?, last_verified_at = ? WHERE hash = ? AND original_sha256 = ? AND stored_sha256 = ?
      AND original_size_bytes = ? AND stored_size_bytes = ? AND compression = 'none'
      AND kind = 'text_body' AND mime_type = 'text/plain'`,
    [now, now, ref.hash, ref.hash, ref.hash, ref.byteLength, ref.byteLength]);
    if (updated.changes !== 1) throw new Error('sync_current_body_manifest_changed');
    count += 1;
  }
}
