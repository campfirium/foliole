import type { DbPort } from './dbPort.js';

/** Validate the actual projection, including ancestors already present locally. */
export async function assertCurrentNodeParentChain(db: DbPort, nodeId: string) {
  const seen = new Set<string>();
  let id: string | null = nodeId;
  while (id !== null) {
    if (seen.has(id)) throw new Error('framed_sync_node_parent_cycle');
    seen.add(id);
    const rows: { parent_id: string | null }[] = await db.query('SELECT parent_id FROM nodes WHERE id = ?', [id]);
    const node = rows[0];
    if (!node) return;
    id = node.parent_id;
  }
}
