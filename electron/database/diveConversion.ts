import { ensureSpecialRootNodesForInput } from '../../lib/core/database/nodeMutationSpecialRoots.js';
import { ensureNodeParentMembership } from '../../lib/core/database/nodeOrderMutations.js';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import { DIVE_NODE_FILTER, readDiveNode } from '../../lib/core/nodes/dive.js';
import { createManualVirtualNodeFilter, isManualVirtualNodeFilter, parseVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import type { SqliteDatabase } from './connection.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

export function convertDiveDirectory(db: SqliteDatabase, nodeId: string, target: 'dive' | 'index') {
  return db.transaction(() => {
    const row = db.prepare(`SELECT title, parent_id, virtual_filter FROM nodes
      WHERE id = ? AND kind = 'folder' AND deleted_at IS NULL`).get(nodeId) as
      { title: string; parent_id: string | null; virtual_filter: string | null } | undefined;
    if (!row || db.prepare('SELECT 1 FROM nodes WHERE parent_id = ? LIMIT 1').get(nodeId)) {
      throw new Error('Directory is unavailable for conversion');
    }
    const filter = parseVirtualNodeFilter(row.virtual_filter);
    const valid = target === 'dive'
      ? row.parent_id === VIRTUAL_ROOT_NODE_ID && isManualVirtualNodeFilter(filter)
      : Boolean(readDiveNode({ id: nodeId, kind: 'folder', title: row.title, parentNodeId: row.parent_id, virtualFilter: filter }));
    if (!valid) throw new Error('Directory is unavailable for conversion');

    const driver = createBetterSqlite3Driver(db);
    const hostName = requireDatabaseHostName(driver);
    const updatedAt = new Date().toISOString();
    const parentNodeId = target === 'dive' ? null : VIRTUAL_ROOT_NODE_ID;
    const virtualFilter = target === 'dive' ? DIVE_NODE_FILTER : createManualVirtualNodeFilter();
    ensureSpecialRootNodesForInput(driver, { nodeId, parentNodeId, updatedAt });
    driver.execute(`UPDATE nodes SET parent_id = ?, virtual_filter = ?, updated_at = ?,
      last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
    [parentNodeId, JSON.stringify(virtualFilter), updatedAt, hostName, nodeId]);
    ensureNodeParentMembership(driver, nodeId);
    flushNodeSyncVersionWithDriver(driver, nodeId, hostName, updatedAt);
    return nodeId;
  }).immediate();
}
