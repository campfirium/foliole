import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { isUnavailableSequentialTopic } from '../../../../../lib/core/review/sequentialReadingSlotOccupancy';
import { isSequentialReadingSourceFolder } from '../../../../../lib/core/review/sequentialReadingSources';
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

type WriteNodes = Record<string, WorkspaceNodeSnapshot>;

// Whether a subtree holds an enabled Sequential Reading source or a locked item, answered from ids alone.
const SUBTREE_READING_PROBE_SQL = `WITH RECURSIVE descendants(id) AS (
  SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
  UNION SELECT child.id FROM nodes child JOIN descendants parent ON child.parent_id = parent.id
) SELECT 1 AS found FROM descendants d JOIN nodes n ON n.id = d.id LEFT JOIN node_reading r ON r.node_id = d.id
  WHERE n.sequential_reading_enabled = 1 OR r.state = 'locked' LIMIT 1`;

async function loadSubtreesAndAncestors(db: DbPort, rootIds: readonly string[], ancestorIds: readonly string[]) {
  const rows = await db.query(WRITE_NODE_IDS_SQL, [JSON.stringify(rootIds), JSON.stringify(ancestorIds)]);
  const nodes: WriteNodes = await loadCompanionContentProjection(db, rows.flatMap(row => typeof row.id === 'string' ? [row.id] : []), true);
  return nodes;
}

/**
 * The enabled Sequential Reading folders on the ancestor chains of `ids` (each id included), or null when an enabled
 * topic is on a chain: a topic source orders its items by the whole library's order, which a bounded read cannot give.
 */
function enabledSourceFolders(nodes: WriteNodes, ids: readonly string[]) {
  const sources = new Set<string>();
  for (const id of ids) {
    const visited = new Set<string>();
    for (let node = nodes[id]; node && !visited.has(node.id); node = node.parentNodeId ? nodes[node.parentNodeId] : undefined) {
      visited.add(node.id);
      if (node.sequentialReadingEnabled !== true) continue;
      if (node.kind === 'topic') return null;
      if (isSequentialReadingSourceFolder(node)) sources.add(node.id);
    }
  }
  return [...sources];
}

/**
 * Reads the nodes a single-node write consumes instead of the whole library: the subtrees it changes,
 * their ancestors and the ancestors of `pathIds` (such as a move target). Siblings are never read, so the cost
 * does not grow with the size of the folders on the way. A node in `keptIds` keeps its subtree as it is (a move
 * or a shelve), so its subtree is read only when probing it finds an enabled source or a locked item.
 * With `sequentialReading`, it also reads what maintaining an enabled Sequential Reading folder on those chains needs:
 * the folder's children, whose order is the folder's own, and the subtree of each child topic that is done or dismissed,
 * which still holds the folder's slot while an item below it can be read. A shelved child never holds the slot.
 * Returns null when the caller needs the whole library.
 */
export async function loadCompanionWriteNodes(db: DbPort, rootIds: readonly string[],
  options: { sequentialReading: boolean; pathIds?: readonly (string | null)[]; keptIds?: readonly string[] }): Promise<WriteNodes | null> {
  // A kept subtree is read only when Sequential Reading maintenance may consume it: an enabled source or a
  // locked item inside it.
  const probed = options.sequentialReading && options.keptIds?.length
    && (await db.query(SUBTREE_READING_PROBE_SQL, [JSON.stringify(options.keptIds)])).length > 0;
  const roots = probed ? [...rootIds, ...options.keptIds!] : rootIds;
  const kept = probed ? [] : options.keptIds ?? [];
  const paths = [...kept, ...(options.pathIds ?? []).filter((id): id is string => id !== null)];
  const nodes = await loadSubtreesAndAncestors(db, roots, [...roots, ...paths]);
  if ([...roots, ...kept].some(id => !nodes[id])) return null;
  if (!options.sequentialReading) return nodes;
  const sources = enabledSourceFolders(nodes, [...roots, ...paths]);
  if (!sources) return null;
  if (!sources.length) return nodes;
  // The content projection of the sources also projects their children.
  const children: WriteNodes = await loadCompanionContentProjection(db, sources);
  // A kept topic joining a source holds its slot through its unread subtree as well.
  const holders = Object.values(children).filter(node => node.parentNodeId !== null && sources.includes(node.parentNodeId) &&
    node.kind === 'topic' && !node.shelvedAt && isUnavailableSequentialTopic(node) && (!nodes[node.id] || kept.includes(node.id))).map(node => node.id);
  const held = holders.length ? await loadSubtreesAndAncestors(db, holders, []) : {};
  return { ...held, ...children, ...nodes };
}

/**
 * The visible library order restricted to nodes read by `loadCompanionWriteNodes`: a node is listed only when its
 * whole ancestor chain is read and none of it is in Trash, as in the visible order. Parents precede their children;
 * Sequential Reading maintenance reads only membership from it for a folder source.
 */
export function companionWriteNodeOrder(nodes: WriteNodes) {
  const visible = new Map<string, boolean>();
  const isVisible = (id: string): boolean => {
    const known = visible.get(id);
    if (known !== undefined) return known;
    visible.set(id, false);
    const node = nodes[id];
    const result = Boolean(node && !node.deletedAt && (node.parentNodeId === null || isVisible(node.parentNodeId)));
    visible.set(id, result);
    return result;
  };
  const depth = (id: string) => { let count = 0; for (let node = nodes[id]; node?.parentNodeId; node = nodes[node.parentNodeId]) count += 1; return count; };
  return Object.keys(nodes).filter(isVisible).map(id => ({ id, depth: depth(id) }))
    .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id)).map(entry => entry.id);
}
