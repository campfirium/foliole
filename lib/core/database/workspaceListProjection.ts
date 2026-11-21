import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { loadScopedChildOrders } from './parentChildOrder.js';
import { queryWorkspaceRows } from './workspaceListSnapshot.js';
import { buildWorkspaceListNodesById } from './workspaceListSnapshotNodes.js';
import { loadUntitledSequenceByParent } from './workspaceUntitledSequence.js';

/**
 * The list structure around a change: the full child sequence, hidden children included, of every parent
 * the change can reach. `memberIds` are the stored ids among those children and `checkedNodeIds`; a checked
 * id missing from it no longer exists.
 */
export interface WorkspaceListStructure {
  childOrders: Array<{ parentNodeId: string | null; childIds: string[] }>;
  memberIds: string[];
  checkedNodeIds: string[];
}

export interface WorkspaceListProjection {
  nodesById: ReturnType<typeof buildWorkspaceListNodesById>['nodesById'];
  directOpeningById: Record<string, string | null>;
  nodeOpenStateById: Record<string, { nodeId: string; lastOpenedAt: string }>;
  requestedNodeIds: string[];
  structure: WorkspaceListStructure | null;
  untitledSequenceByParent: Record<string, number>;
}

/** Reads descendants for anchor/visibility changes and ancestors for inherited openings. */
function projectionIds(driver: DatabaseDriver, roots: readonly string[], ancestors: readonly string[]) {
  const rows = driver.queryAll<{ id: string; descendant: number }>(`WITH RECURSIVE
    descendants(id) AS (SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
      UNION SELECT n.id FROM nodes n JOIN descendants d ON n.parent_id = d.id),
    ancestors(id, parent_id) AS (SELECT id, parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
      UNION SELECT n.id, n.parent_id FROM nodes n JOIN ancestors a ON n.id = a.parent_id)
    SELECT id, 1 AS descendant FROM descendants UNION SELECT id, 0 AS descendant FROM ancestors`,
  [JSON.stringify(roots), JSON.stringify([...roots, ...ancestors])]);
  return { ids: [...new Set(rows.map(row => row.id))], descendants: rows.filter(row => row.descendant).map(row => row.id) };
}

/**
 * The parents whose children can change with these nodes: the root, the nodes and their stored descendants,
 * their stored parents, and the ids the caller still lists elsewhere (`structureNodeIds`).
 */
function loadStructure(driver: DatabaseDriver, input: { descendants: readonly string[];
  parents: readonly (string | null)[]; structureNodeIds: readonly string[] }): WorkspaceListStructure {
  const childOrders = loadScopedChildOrders(driver,
    [null, ...input.descendants, ...input.parents, ...input.structureNodeIds]);
  const existing = driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))',
    [JSON.stringify(input.structureNodeIds)]).map(row => row.id);
  return { childOrders, checkedNodeIds: [...input.structureNodeIds],
    memberIds: [...new Set([...childOrders.flatMap(order => order.childIds), ...input.descendants, ...existing])] };
}

export function loadWorkspaceListProjection(driver: DatabaseDriver, input: {
  nodeIds: readonly string[]; ancestorNodeIds?: readonly string[]; structure: boolean;
  structureNodeIds?: readonly string[];
}): WorkspaceListProjection {
  return driver.transaction(() => {
    const { ids, descendants } = projectionIds(driver, input.nodeIds, input.ancestorNodeIds ?? []);
    const { nodesById, directOpeningById } = buildWorkspaceListNodesById(queryWorkspaceRows(driver, ids));
    const opens = driver.queryAll<DatabaseRow & { node_id: string; last_opened_at: string }>(
      'SELECT node_id, last_opened_at FROM node_open_state WHERE node_id IN (SELECT value FROM json_each(?))',
      [JSON.stringify(ids)]);
    return {
      nodesById, directOpeningById: Object.fromEntries(directOpeningById),
      nodeOpenStateById: Object.fromEntries(opens.map(row => [row.node_id,
        { nodeId: row.node_id, lastOpenedAt: row.last_opened_at }])),
      requestedNodeIds: [...input.nodeIds],
      structure: input.structure ? loadStructure(driver, { descendants,
        parents: input.nodeIds.map(id => nodesById[id]?.parentNodeId ?? null),
        structureNodeIds: input.structureNodeIds ?? [] }) : null,
      untitledSequenceByParent: loadUntitledSequenceByParent(driver)
    };
  });
}
