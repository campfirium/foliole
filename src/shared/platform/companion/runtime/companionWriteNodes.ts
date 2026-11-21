import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { loadCompanionContentProjection } from '../sync/workspace-state/companionContentProjection';

// Every descendant of the subtree roots plus every ancestor of the subtree and path roots.
const WRITE_NODE_IDS_SQL = `WITH RECURSIVE descendants(id) AS (
  SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
  UNION SELECT child.id FROM nodes child JOIN descendants parent ON child.parent_id = parent.id
), ancestors(id, parent_id) AS (
  SELECT id, parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
  UNION SELECT parent.id, parent.parent_id FROM nodes parent JOIN ancestors child ON parent.id = child.parent_id
) SELECT id FROM descendants UNION SELECT id FROM ancestors`;

/**
 * Reads the nodes a single-node write consumes instead of the whole library: the subtrees it changes,
 * their ancestors and the ancestors of `pathIds` (such as a move target). Siblings are never read, so the cost
 * does not grow with the size of the folders on the way.
 * Returns null when the caller needs the whole library.
 */
export async function loadCompanionWriteNodes(db: DbPort, rootIds: readonly string[],
  options: { sequentialReading: boolean; pathIds?: readonly (string | null)[] }): Promise<Record<string, WorkspaceNodeSnapshot> | null> {
  const paths = (options.pathIds ?? []).filter((id): id is string => id !== null);
  const rows = await db.query(WRITE_NODE_IDS_SQL, [JSON.stringify(rootIds), JSON.stringify([...rootIds, ...paths])]);
  const nodes: Record<string, WorkspaceNodeSnapshot> = await loadCompanionContentProjection(db,
    rows.flatMap(row => typeof row.id === 'string' ? [row.id] : []), true);
  if (rootIds.some(id => !nodes[id])) return null;
  // Sequential Reading may unlock items across a whole source in library order, so it keeps the complete read.
  // Without an enabled source on the ancestor chains or a locked item in the subtrees, its maintenance changes nothing.
  if (options.sequentialReading && Object.values(nodes).some(node =>
    node.sequentialReadingEnabled === true || node.reading?.state === 'locked')) return null;
  return nodes;
}
