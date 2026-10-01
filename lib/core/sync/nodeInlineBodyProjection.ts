import { projectNodeInlineContent } from '../database/nodeInlineProjection.js';

import type { DbPort } from './dbPort.js';

/** Caller owns the body-transfer transaction; project only the transferred resources. */
export async function refreshNodeInlineBodiesForHashes(port: DbPort, hashes: readonly string[]) {
  let after = '';
  for (;;) {
    const [row] = await port.query<{ id: string; body_blob_hash: string; content: string; body: string }>(
      `SELECT n.id, n.body_blob_hash, n.content, CAST(data.data AS TEXT) AS body
       FROM nodes n JOIN content_blob_data data ON data.hash = n.body_blob_hash
       WHERE n.id > ? AND n.body_blob_hash IN (SELECT value FROM json_each(?))
       ORDER BY n.id LIMIT 1`, [after, JSON.stringify(hashes)]);
    if (!row) return;
    const projection = projectNodeInlineContent(row.body);
    if (projection !== row.content && (row.content === '' || row.content === row.body)) await port.run(
      'UPDATE nodes SET content = ? WHERE id = ? AND body_blob_hash = ?',
      [projection, row.id, row.body_blob_hash]);
    after = row.id;
  }
}
