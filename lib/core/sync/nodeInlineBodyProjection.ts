import type { DbPort } from './dbPort.js';
import { readNodeInlineBodyProjection } from './readNodeInlineBodyProjection.js';

/** Caller owns the body-transfer transaction; project only the transferred resources. */
export async function refreshNodeInlineBodiesForHashes(port: DbPort, hashes: readonly string[]) {
  let after = '';
  for (;;) {
    const [row] = await port.query<{ id: string; body_blob_hash: string; size: number }>(
      `SELECT n.id, n.body_blob_hash, length(CAST(data.data AS BLOB)) AS size
       FROM nodes n JOIN content_blob_data data ON data.hash = n.body_blob_hash
       WHERE n.id > ? AND n.body_blob_hash IN (SELECT value FROM json_each(?))
       ORDER BY n.id LIMIT 1`, [after, JSON.stringify(hashes)]);
    if (!row) return;
    const projection = await readNodeInlineBodyProjection(port, row.body_blob_hash, row.size);
    await port.run(`UPDATE nodes SET content = ? WHERE id = ? AND body_blob_hash = ?
      AND content != ? AND (content = '' OR content = (
        SELECT CAST(data AS TEXT) FROM content_blob_data WHERE hash = ?))`,
    [projection, row.id, row.body_blob_hash, projection, row.body_blob_hash]);
    after = row.id;
  }
}
