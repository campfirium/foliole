import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { loadCompanionContentProjection } from '../sync/workspace-state/companionContentProjection';

// Every descendant of the roots plus every ancestor; the projection then adds the ancestors' children.
const TRASH_WRITE_NODE_IDS_SQL = `WITH RECURSIVE descendants(id) AS (
  SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
  UNION SELECT child.id FROM nodes child JOIN descendants parent ON child.parent_id = parent.id
), ancestors(id, parent_id) AS (
  SELECT id, parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
  UNION SELECT parent.id, parent.parent_id FROM nodes parent JOIN ancestors child ON parent.id = child.parent_id
) SELECT id FROM descendants UNION SELECT id FROM ancestors`;

/**
 * Reads the nodes a move to Trash consumes instead of the whole library: the moved subtrees,
 * their ancestors and the ancestors' children. Returns null when the caller needs the whole library.
 */
export async function loadCompanionTrashWriteNodes(db: DbPort, rootIds: readonly string[],
  options: { sequentialReading: boolean }): Promise<Record<string, WorkspaceNodeSnapshot> | null> {
  const ids = JSON.stringify(rootIds);
  const rows = await db.query(TRASH_WRITE_NODE_IDS_SQL, [ids, ids]);
  const nodes: Record<string, WorkspaceNodeSnapshot> = await loadCompanionContentProjection(db,
    rows.flatMap(row => typeof row.id === 'string' ? [row.id] : []));
  if (rootIds.some(id => !nodes[id])) return null;
  // Sequential Reading may unlock items across a whole source in library order, so it keeps the complete read.
  // Without an enabled source or a locked item in reach, its maintenance changes nothing.
  if (options.sequentialReading && Object.values(nodes).some(node =>
    node.sequentialReadingEnabled === true || node.reading?.state === 'locked')) return null;
  return nodes;
}
