import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import {
  assertValidNodeVersionSnapshot,
  SYNC_PACK_NODE_VERSION_COLUMNS,
  type SyncPackNodeVersionParentRow,
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
    loadCurrentVersion(driver, node.id, node.current_version_id, visited, ordered);
  }
  return ordered;
}

export function loadSyncPackNodeVersionParentRows(
  driver: DatabaseDriver,
  versions: SyncPackNodeVersionRow[]
): SyncPackNodeVersionParentRow[] {
  if (versions.length === 0) return [];
  const ids = versions.map((row) => row.version_id);
  const objectIds = new Map(versions.map((row) => [row.version_id, row.object_id]));
  const rows = driver.queryAll<SyncPackNodeVersionParentRow>(
    `SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents
     WHERE version_id IN (${ids.map(() => '?').join(', ')})
     ORDER BY version_id ASC, ordinal ASC`,
    ids
  );
  return rows.filter((row) => {
    const parentObjectId = objectIds.get(row.parent_version_id);
    if (parentObjectId === undefined) return false;
    if (parentObjectId !== objectIds.get(row.version_id)) {
      throw new Error(`sync_pack_node_version_cross_object:${row.version_id}`);
    }
    return true;
  });
}

function loadCurrentVersion(
  driver: DatabaseDriver,
  objectId: string,
  versionId: string | null,
  visited: Map<string, string>,
  ordered: SyncPackNodeVersionRow[]
) {
  if (versionId === null) return;
  const visitedObjectId = visited.get(versionId);
  if (visitedObjectId !== undefined) {
    if (visitedObjectId !== objectId) throw new Error(`sync_pack_node_version_cross_object:${versionId}`);
    return;
  }
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
  visited.set(versionId, objectId);
  ordered.push(row);
}
