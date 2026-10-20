import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { projectParentChildOrder, readOrderMembers, readParentChildOrders } from './parentChildOrder.js';
import { queryWorkspaceRows } from './workspaceListSnapshot.js';
import { buildWorkspaceListNodesById } from './workspaceListSnapshotNodes.js';
import { loadUntitledSequenceByParent } from './workspaceUntitledSequence.js';

export interface WorkspaceListProjection {
  nodesById: ReturnType<typeof buildWorkspaceListNodesById>['nodesById'];
  directOpeningById: Record<string, string | null>;
  nodeOpenStateById: Record<string, { nodeId: string; lastOpenedAt: string }>;
  requestedNodeIds: string[];
  structure: { nodeOrder: string[]; memberIds: string[] } | null;
  untitledSequenceByParent: Record<string, number>;
}

/** Reads descendants for anchor/visibility changes and ancestors for inherited openings. */
function projectionIds(driver: DatabaseDriver, roots: readonly string[], ancestors: readonly string[]) {
  return driver.queryAll<{ id: string }>(`WITH RECURSIVE
    descendants(id) AS (SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
      UNION SELECT n.id FROM nodes n JOIN descendants d ON n.parent_id = d.id),
    ancestors(id, parent_id) AS (SELECT id, parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
      UNION SELECT n.id, n.parent_id FROM nodes n JOIN ancestors a ON n.id = a.parent_id)
    SELECT id FROM descendants UNION SELECT id FROM ancestors`, [JSON.stringify(roots), JSON.stringify([...roots, ...ancestors])])
    .map(row => row.id);
}

export function loadWorkspaceListProjection(driver: DatabaseDriver, input: {
  nodeIds: readonly string[]; ancestorNodeIds?: readonly string[]; structure: boolean;
}): WorkspaceListProjection {
  return driver.transaction(() => {
    const ids = projectionIds(driver, input.nodeIds, input.ancestorNodeIds ?? []);
    const { nodesById, directOpeningById } = buildWorkspaceListNodesById(queryWorkspaceRows(driver, ids));
    const opens = driver.queryAll<DatabaseRow & { node_id: string; last_opened_at: string }>(
      'SELECT node_id, last_opened_at FROM node_open_state WHERE node_id IN (SELECT value FROM json_each(?))',
      [JSON.stringify(ids)]);
    const members = input.structure ? readOrderMembers(driver) : null;
    return {
      nodesById, directOpeningById: Object.fromEntries(directOpeningById),
      nodeOpenStateById: Object.fromEntries(opens.map(row => [row.node_id,
        { nodeId: row.node_id, lastOpenedAt: row.last_opened_at }])),
      requestedNodeIds: [...input.nodeIds],
      structure: members ? {
        memberIds: members.map(row => row.id),
        nodeOrder: projectParentChildOrder(members, readParentChildOrders(driver))
      } : null,
      untitledSequenceByParent: loadUntitledSequenceByParent(driver)
    };
  });
}
