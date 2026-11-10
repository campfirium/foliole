import { ensureSpecialRootNodesForInput } from '../../lib/core/database/nodeMutationSpecialRoots.js';
import { ensureNodeParentMembership } from '../../lib/core/database/nodeOrderMutations.js';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import { DIVE_NODE_FILTER, readDiveNode } from '../../lib/core/nodes/dive.js';
import { stringifyManualChildOrder } from '../../lib/core/nodes/manualChildOrder.js';
import { createManualVirtualNodeFilter, isManualVirtualNodeFilter, parseVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import type { SqliteDatabase } from './connection.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

function eligibleMatchedTopics(db: SqliteDatabase, ids: readonly string[]) {
  const rows = db.prepare(`WITH RECURSIVE matched AS (
    SELECT topic.id, topic.parent_id, entry.key AS position
    FROM json_each(?) entry JOIN nodes topic ON topic.id = entry.value
    LEFT JOIN nodes parent ON parent.id = topic.parent_id
    WHERE topic.kind = 'topic' AND topic.anchor_link IS NULL AND topic.virtual_filter IS NULL
      AND (topic.parent_id IS NULL OR (parent.kind = 'folder' AND parent.virtual_filter IS NULL AND parent.id <> ?))
  ), ancestors(source_id, id, parent_id, deleted_at) AS (
    SELECT id, id, parent_id, deleted_at FROM nodes WHERE id IN (SELECT id FROM matched)
    UNION
    SELECT a.source_id, p.id, p.parent_id, p.deleted_at FROM ancestors a JOIN nodes p ON p.id = a.parent_id
  ), visible AS (
    SELECT source_id FROM ancestors GROUP BY source_id HAVING MAX(parent_id IS NULL) = 1 AND MAX(deleted_at IS NOT NULL) = 0
  )
  SELECT matched.id FROM matched JOIN visible ON source_id = matched.id ORDER BY position`)
    .all(JSON.stringify(ids), VIRTUAL_ROOT_NODE_ID) as { id: string }[];
  return [...new Set(rows.map(row => row.id))];
}

export function convertDiveDirectory(db: SqliteDatabase, nodeId: string, target: 'dive' | 'index',
  matchedTopics?: { filter: string; ids: readonly string[] }) {
  return db.transaction(() => {
    const row = db.prepare(`SELECT title, parent_id, virtual_filter FROM nodes
      WHERE id = ? AND kind = 'folder' AND deleted_at IS NULL`).get(nodeId) as
      { title: string; parent_id: string | null; virtual_filter: string | null } | undefined;
    if (!row || db.prepare('SELECT 1 FROM nodes WHERE parent_id = ? LIMIT 1').get(nodeId)) {
      throw new Error('Directory is unavailable for conversion');
    }
    const filter = parseVirtualNodeFilter(row.virtual_filter);
    const useMatchedTopics = target === 'dive' && filter !== null && !isManualVirtualNodeFilter(filter);
    const valid = target === 'dive'
      ? row.parent_id === VIRTUAL_ROOT_NODE_ID && (useMatchedTopics
        ? matchedTopics?.filter === JSON.stringify(filter) : isManualVirtualNodeFilter(filter) && !matchedTopics)
      : !matchedTopics && Boolean(readDiveNode({
        id: nodeId, kind: 'folder', title: row.title, parentNodeId: row.parent_id, virtualFilter: filter
      }));
    if (!valid) throw new Error('Directory is unavailable for conversion');

    const driver = createBetterSqlite3Driver(db);
    const hostName = requireDatabaseHostName(driver);
    const updatedAt = new Date().toISOString();
    const parentNodeId = target === 'dive' ? null : VIRTUAL_ROOT_NODE_ID;
    const virtualFilter = target === 'dive' ? DIVE_NODE_FILTER : createManualVirtualNodeFilter();
    ensureSpecialRootNodesForInput(driver, { nodeId, parentNodeId, updatedAt });
    const resultSources = useMatchedTopics && matchedTopics
      ? stringifyManualChildOrder(eligibleMatchedTopics(db, matchedTopics.ids)) : null;
    driver.execute(`UPDATE nodes SET parent_id = ?, virtual_filter = ?, updated_at = ?,
      manual_child_order = CASE WHEN ? THEN ? ELSE manual_child_order END,
      last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
    [parentNodeId, JSON.stringify(virtualFilter), updatedAt, Number(useMatchedTopics), resultSources, hostName, nodeId]);
    ensureNodeParentMembership(driver, nodeId);
    flushNodeSyncVersionWithDriver(driver, nodeId, hostName, updatedAt);
    return nodeId;
  }).immediate();
}
