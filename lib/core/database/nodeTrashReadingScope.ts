import type { DatabaseDriver } from './driver.js';
import { captureMoveReadingScope } from './nodeMoveReadingContext.js';

const ENABLED_SOURCE_IN_REACH_SQL = `WITH RECURSIVE chain(id, parent_id) AS (
  SELECT id, parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
  UNION SELECT n.id, n.parent_id FROM nodes n JOIN chain c ON n.id = c.parent_id
) SELECT 1 AS found FROM chain JOIN nodes n ON n.id = chain.id
  WHERE n.sequential_reading_enabled = 1 AND +n.deleted_at IS NULL LIMIT 1`;

/**
 * Captures the Sequential Reading scope of a move to or from Trash. Only an enabled source on the nodes' own
 * ancestor chains can change, so without one nothing is read beyond this check.
 */
export function captureTrashReadingScope(driver: DatabaseDriver, nodeIds: readonly string[]) {
  if (!nodeIds.length || !driver.queryOne(ENABLED_SOURCE_IN_REACH_SQL, [JSON.stringify(nodeIds)])) return null;
  const nodes = driver.queryAll<{ id: string; parent_id: string | null }>(
    'SELECT id, parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify(nodeIds)]);
  return captureMoveReadingScope(driver, { nodes: nodes.map((node) => ({ nodeId: node.id, parentNodeId: node.parent_id })) });
}
