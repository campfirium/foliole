import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import {
  assertValidNodeVersionSnapshot,
  SYNC_PACK_NODE_VERSION_COLUMNS,
  type SyncPackNodeVersionRow
} from '../../lib/core/sync/syncPackNodeVersions.js';

import type { NodePackRow } from './syncPackRows.js';

export function loadSyncPackNodeVersionRows(
  driver: DatabaseDriver,
  nodes: NodePackRow[]
): SyncPackNodeVersionRow[] {
  const ordered: SyncPackNodeVersionRow[] = [];
  const visited = new Map<string, string>();
  for (const node of [...nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    visitVersion(driver, node.id, node.current_version_id, visited, new Set(), ordered);
  }
  return ordered;
}

function visitVersion(
  driver: DatabaseDriver,
  objectId: string,
  versionId: string | null,
  visited: Map<string, string>,
  visiting: Set<string>,
  ordered: SyncPackNodeVersionRow[]
) {
  if (versionId === null) return;
  const visitedObjectId = visited.get(versionId);
  if (visitedObjectId !== undefined) {
    if (visitedObjectId !== objectId) throw new Error(`sync_pack_node_version_cross_object:${versionId}`);
    return;
  }
  if (visiting.has(versionId)) throw new Error(`sync_pack_node_version_cycle:${versionId}`);
  visiting.add(versionId);
  const row = driver.queryOne<SyncPackNodeVersionRow>(
    `SELECT ${SYNC_PACK_NODE_VERSION_COLUMNS.join(', ')}
     FROM node_sync_versions WHERE version_id = ?`,
    [versionId]
  );
  if (!row) throw new Error(`sync_pack_node_version_missing:${versionId}`);
  if (row.object_id !== objectId) {
    throw new Error(`sync_pack_node_version_cross_object:${versionId}`);
  }
  assertValidNodeVersionSnapshot(row);
  visitVersion(driver, objectId, row.parent_version_id, visited, visiting, ordered);
  visiting.delete(versionId);
  visited.set(versionId, objectId);
  ordered.push(row);
}
