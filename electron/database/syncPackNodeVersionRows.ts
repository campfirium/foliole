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
    loadVersionLineage(driver, node.id, node.current_version_id, visited, ordered, true);
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

function loadVersionLineage(
  driver: DatabaseDriver,
  objectId: string,
  versionId: string | null,
  visited: Map<string, string>,
  ordered: SyncPackNodeVersionRow[],
  required = false
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
  if (!row) {
    if (required) throw new Error(`sync_pack_node_version_missing:${versionId}`);
    return;
  }
  if (row.object_id !== objectId) {
    throw new Error(`sync_pack_node_version_cross_object:${versionId}`);
  }
  assertValidNodeVersionSnapshot(row);
  visited.set(versionId, objectId);
  for (const parentVersionId of loadParentVersionIds(driver, row)) {
    loadVersionLineage(driver, objectId, parentVersionId, visited, ordered);
  }
  ordered.push(row);
}

function loadParentVersionIds(driver: DatabaseDriver, row: SyncPackNodeVersionRow) {
  const rows = driver.queryAll<{ parent_version_id: string }>(
    `SELECT parent_version_id FROM node_sync_version_parents
     WHERE version_id = ? ORDER BY ordinal ASC`,
    [row.version_id]
  );
  if (rows.length > 0) return rows.map((parent) => parent.parent_version_id);
  return row.parent_version_id ? [row.parent_version_id] : [];
}
