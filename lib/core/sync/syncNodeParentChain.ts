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

/** One read checks every chain: a chain ends at a missing node or a root, so a chain without an end is a cycle. */
export async function assertCurrentNodeParentChains(db: DbPort, nodeIds: readonly string[]) {
  if (!nodeIds.length) return;
  const [cycle] = await db.query<{ start: string }>(`WITH RECURSIVE chain(start, id) AS (
      SELECT value, value FROM json_each(?)
      UNION SELECT chain.start, node.parent_id FROM chain JOIN nodes node ON node.id = chain.id
        WHERE node.parent_id IS NOT NULL)
    SELECT start FROM chain GROUP BY start
    HAVING SUM(CASE WHEN EXISTS (SELECT 1 FROM nodes node WHERE node.id = chain.id AND node.parent_id IS NOT NULL)
      THEN 0 ELSE 1 END) = 0 LIMIT 1`, [JSON.stringify(nodeIds)]);
  if (cycle) throw new Error('framed_sync_node_parent_cycle');
}
