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
    visitVersion(driver, node.id, node.current_version_id, visited, new Set(), ordered);
  }
  return ordered;
}

export function loadSyncPackNodeVersionParentRows(
  driver: DatabaseDriver,
  versions: SyncPackNodeVersionRow[]
): SyncPackNodeVersionParentRow[] {
  if (versions.length === 0) return [];
  const ids = versions.map((row) => row.version_id);
  return driver.queryAll<SyncPackNodeVersionParentRow>(
    `SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents
     WHERE version_id IN (${ids.map(() => '?').join(', ')})
     ORDER BY version_id ASC, ordinal ASC`,
    ids
  );
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
  for (const parentVersionId of loadParentVersionIds(driver, row)) {
    visitVersion(driver, objectId, parentVersionId, visited, visiting, ordered);
  }
  visiting.delete(versionId);
  visited.set(versionId, objectId);
  ordered.push(row);
}

function loadParentVersionIds(driver: DatabaseDriver, row: SyncPackNodeVersionRow) {
  const parents = driver.queryAll<{ parent_version_id: string }>(
    `SELECT parent_version_id FROM node_sync_version_parents
     WHERE version_id = ? ORDER BY ordinal ASC`,
    [row.version_id]
  ).map((parent) => parent.parent_version_id);
  if (parents.length > 0) return parents;
  return row.parent_version_id ? [row.parent_version_id] : [];
}
