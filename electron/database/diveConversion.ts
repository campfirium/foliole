import { DIVE_CONVERSION_MATCHES_SQL } from '../../lib/core/database/diveConversionMatchesSql.js';
import { ensureSpecialRootNodesForInput } from '../../lib/core/database/nodeMutationSpecialRoots.js';
import { ensureNodeParentMembership } from '../../lib/core/database/nodeOrderMutations.js';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import { diveDirectoryConversionFields, resolveDiveDirectoryConversionTarget, type DiveDirectoryConversionTarget } from '../../lib/core/nodes/diveDirectoryConversion.js';
import { stringifyManualChildOrder } from '../../lib/core/nodes/manualChildOrder.js';
import { isManualVirtualNodeFilter, parseVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import type { SqliteDatabase } from './connection.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

function eligibleMatchedTopics(db: SqliteDatabase, ids: readonly string[]) {
  const rows = db.prepare(DIVE_CONVERSION_MATCHES_SQL).all(JSON.stringify(ids), VIRTUAL_ROOT_NODE_ID) as { id: string }[];
  return [...new Set(rows.map(row => row.id))];
}

export function convertDiveDirectory(db: SqliteDatabase, nodeId: string, target: DiveDirectoryConversionTarget,
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
    const directory = { id: nodeId, kind: 'folder', title: row.title, parentNodeId: row.parent_id, virtualFilter: filter };
    if (resolveDiveDirectoryConversionTarget(directory) !== target ||
        (useMatchedTopics ? matchedTopics?.filter !== JSON.stringify(filter) : matchedTopics)) {
      throw new Error('Directory is unavailable for conversion');
    }

    const driver = createBetterSqlite3Driver(db);
    const hostName = requireDatabaseHostName(driver);
    const updatedAt = new Date().toISOString();
    const { parentNodeId, virtualFilter } = diveDirectoryConversionFields(target);
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
