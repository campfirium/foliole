import { DIVE_CONVERSION_MATCHES_SQL } from '../../lib/core/database/diveConversionMatchesSql.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { ensureSpecialRootNodesForInput } from '../../lib/core/database/nodeMutationSpecialRoots.js';
import { ensureNodeParentMembership } from '../../lib/core/database/nodeOrderMutations.js';
import { loadDerivedNodeOrder } from '../../lib/core/database/parentChildOrder.js';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import { diveDirectoryConversionFields, resolveDiveDirectoryConversionTarget, type DiveDirectoryConversionTarget } from '../../lib/core/nodes/diveDirectoryConversion.js';
import { parseManualChildOrder, stringifyManualChildOrder } from '../../lib/core/nodes/manualChildOrder.js';
import { isManualVirtualNodeFilter, parseVirtualNodeFilter, type VirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
import { applyVirtualNodeManualOrder, createConditionalVirtualNodeMatcher } from '../../lib/core/nodes/virtualNodeResults.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import type { SqliteDatabase } from './connection.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

function eligibleMatchedTopics(db: SqliteDatabase, ids: readonly string[]) {
  const rows = db.prepare(DIVE_CONVERSION_MATCHES_SQL).all(JSON.stringify(ids), VIRTUAL_ROOT_NODE_ID) as { id: string }[];
  return [...new Set(rows.map(row => row.id))];
}

function loadSavedMatchedTopics(db: SqliteDatabase, driver: DatabaseDriver, filter: VirtualNodeFilter,
  manualOrder: string | null) {
  const matches = createConditionalVirtualNodeMatcher(filter);
  if (!matches) return [];
  const ids = new Set<string>();
  const candidates = db.prepare(`SELECT id, title, content FROM nodes WHERE kind = 'topic'
    AND deleted_at IS NULL AND anchor_link IS NULL AND virtual_filter IS NULL`)
    .iterate() as Iterable<{ id: string; title: string; content: string }>;
  for (const topic of candidates) {
    if (matches(topic)) ids.add(topic.id);
  }
  if (!ids.size) return [];
  const ordered = loadDerivedNodeOrder(driver).filter(id => ids.has(id));
  return eligibleMatchedTopics(db, applyVirtualNodeManualOrder(ordered, parseManualChildOrder(manualOrder)));
}

export function convertDiveDirectory(db: SqliteDatabase, nodeId: string, target: DiveDirectoryConversionTarget,
  matchedTopics?: { filter: string; ids: readonly string[] }) {
  return db.transaction(() => {
    const row = db.prepare(`SELECT title, parent_id, virtual_filter, manual_child_order FROM nodes
      WHERE id = ? AND kind = 'folder' AND deleted_at IS NULL`).get(nodeId) as
      { title: string; parent_id: string | null; virtual_filter: string | null; manual_child_order: string | null } | undefined;
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
    const resultSources = useMatchedTopics
      ? stringifyManualChildOrder(loadSavedMatchedTopics(db, driver, filter, row.manual_child_order)) : null;
    driver.execute(`UPDATE nodes SET parent_id = ?, virtual_filter = ?, updated_at = ?,
      manual_child_order = CASE WHEN ? THEN ? ELSE manual_child_order END,
      last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
    [parentNodeId, JSON.stringify(virtualFilter), updatedAt, Number(useMatchedTopics), resultSources, hostName, nodeId]);
    ensureNodeParentMembership(driver, nodeId);
    flushNodeSyncVersionWithDriver(driver, nodeId, hostName, updatedAt);
    return nodeId;
  }).immediate();
}
