import type { DbPort, DbRow } from './dbPort.js';

interface OrphanTombstone extends DbRow {
  content_hash: string;
  deleted_at: string;
  host_name: string;
  node_id: string;
}

export async function backfillOrphanSyncTombstones(db: DbPort) {
  let inserted = 0;
  for (;;) {
    const count = await db.transaction(async (tx) => {
      const rows = await tx.query<OrphanTombstone>(
        `SELECT t.node_id, t.content_hash, t.host_name, t.deleted_at
         FROM node_sync_tombstones t
         WHERE NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = t.node_id)
           AND NOT EXISTS (SELECT 1 FROM sync_object_state s
             WHERE s.object_type = 'node' AND s.object_id = t.node_id)
         ORDER BY t.node_id LIMIT 128`
      );
      for (const row of rows) {
        await tx.run(
          `INSERT OR IGNORE INTO sync_object_state
           (object_type, object_id, state_seq, content_hash,
            last_modified_by_host_name, updated_at, deleted_at)
           VALUES ('node', ?, (SELECT high_water + 1 FROM sync_state_sequence WHERE singleton_id = 1),
             ?, ?, ?, ?)`,
          [row.node_id, row.content_hash, row.host_name, row.deleted_at, row.deleted_at]
        );
      }
      return rows.length;
    });
    inserted += count;
    if (count < 128) return inserted;
  }
}
