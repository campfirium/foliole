import type { DbPort } from './dbPort.js';

export const SYNC_PACK_RESOURCE_ARTICLE_BATCH = 64;

/** Schedule current articles even when no object state changed in this identity round. */
export async function enqueueSyncIdentityResourceScanPage(db: DbPort, args: {
  groupId: string; peerId: string; afterId: string;
}) {
  return db.transaction(async (tx) => {
    const rows = await tx.query<{ object_id: string }>(`SELECT state.object_id
      FROM sync_object_state state JOIN nodes node ON node.id = state.object_id
      WHERE state.object_type = 'node' AND state.deleted_at IS NULL
        AND state.object_id NOT IN ('special-inbox', 'special-virtual-root')
        AND state.object_id > ? ORDER BY state.object_id LIMIT ?`,
    [args.afterId, SYNC_PACK_RESOURCE_ARTICLE_BATCH]);
    if (!rows.length) return null;
    await tx.run(`INSERT OR IGNORE INTO sync_pack_resource_articles
      (group_id, peer_id, article_id)
      SELECT ?, ?, value FROM json_each(?)`,
    [args.groupId, args.peerId, JSON.stringify(rows.map((row) => row.object_id))]);
    return rows.at(-1)!.object_id;
  });
}

export async function enqueueSyncPackResourceArticles(db: DbPort, args: {
  groupId: string; incomingAlias: string; peerId: string;
}) {
  await db.run(`INSERT OR IGNORE INTO sync_pack_resource_articles
    (group_id, peer_id, article_id)
    SELECT ?, ?, s.object_id FROM ${args.incomingAlias}.sync_object_state s
    JOIN ${args.incomingAlias}.nodes n ON n.id = s.object_id
    WHERE s.object_type = 'node' AND s.deleted_at IS NULL`,
  [args.groupId, args.peerId]);
}

export async function loadSyncPackResourceArticleBatch(db: DbPort, groupId: string,
  peerId: string, afterId = '') {
  const rows = await db.query<{ article_id: string }>(
    `SELECT article_id FROM sync_pack_resource_articles
     WHERE group_id = ? AND peer_id = ? AND article_id > ?
     ORDER BY article_id LIMIT ?`,
    [groupId, peerId, afterId, SYNC_PACK_RESOURCE_ARTICLE_BATCH]
  );
  return rows.map((row) => row.article_id);
}

export async function clearSyncPackResourceArticles(db: DbPort, groupId: string,
  peerId: string, ids: readonly string[]) {
  if (ids.length === 0 || ids.length > SYNC_PACK_RESOURCE_ARTICLE_BATCH) {
    throw new Error('sync_pack_resource_article_batch_invalid');
  }
  await db.transaction(async (tx) => {
    for (const id of ids) {
      await tx.run(`DELETE FROM sync_pack_resource_articles
        WHERE group_id = ? AND peer_id = ? AND article_id = ?`, [groupId, peerId, id]);
    }
  });
}
