import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import {
  assertValidNodeVersionSnapshot,
  SYNC_PACK_NODE_VERSION_COLUMNS,
  type SyncPackNodeVersionParentRow,
  type SyncPackNodeVersionRow
} from '../../lib/core/sync/syncPackNodeVersions.js';
import { projectTopicTextPackSnapshot } from '../../lib/core/sync/topicTextPackPayload.js';

import type { VersionHead } from './syncPackVersionHeads.js';

const VERSION_PARENT_QUERY_BATCH_SIZE = 900;

export function loadSyncPackNodeVersionRows(
  driver: DatabaseDriver,
  nodes: VersionHead[],
  knownVersionIds: readonly string[] = []
): SyncPackNodeVersionRow[] {
  return [...iterateSyncPackNodeVersionRows(driver, nodes, knownVersionIds)];
}

export function* iterateSyncPackNodeVersionRows(
  driver: DatabaseDriver, nodes: VersionHead[], knownVersionIds: readonly string[] = [],
  onIdentity?: (row: Pick<SyncPackNodeVersionRow, 'version_id' | 'object_id'>) => void
): Generator<SyncPackNodeVersionRow> {
  const visited = new Map<string, string>();
  const known = new Set(knownVersionIds);
  for (const node of [...nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    yield* loadVersionLineage(driver, node.id, node.current_version_id, visited, known, onIdentity, true);
    for (const row of driver.queryAll<{ version_id: string }>(
      'SELECT version_id FROM node_sync_versions WHERE object_id = ? ORDER BY created_at, version_id', [node.id])) {
      yield* loadVersionLineage(driver, node.id, row.version_id, visited, known, onIdentity);
    }
  }
}

export function loadSyncPackNodeVersionParentRows(
  driver: DatabaseDriver,
  versions: Pick<SyncPackNodeVersionRow, 'version_id' | 'object_id'>[]
): SyncPackNodeVersionParentRow[] {
  if (versions.length === 0) return [];
  const ids = versions.map((row) => row.version_id);
  const objectIds = new Map(versions.map((row) => [row.version_id, row.object_id]));
  const rows: SyncPackNodeVersionParentRow[] = [];
  for (let index = 0; index < ids.length; index += VERSION_PARENT_QUERY_BATCH_SIZE) {
    const batch = ids.slice(index, index + VERSION_PARENT_QUERY_BATCH_SIZE);
    rows.push(...driver.queryAll<SyncPackNodeVersionParentRow>(
      `SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents
       WHERE version_id IN (${batch.map(() => '?').join(', ')})
       ORDER BY version_id ASC, ordinal ASC`,
      batch
    ));
  }
  return rows.filter((row) => {
    const parentObjectId = objectIds.get(row.parent_version_id) ?? driver.queryOne<{ object_id: string }>(
      'SELECT object_id FROM node_sync_versions WHERE version_id = ?', [row.parent_version_id]
    )?.object_id;
    if (parentObjectId !== undefined && parentObjectId !== objectIds.get(row.version_id)) {
      throw new Error(`sync_pack_node_version_cross_object:${row.version_id}`);
    }
    return true;
  }).sort((left, right) => left.version_id.localeCompare(right.version_id) || left.ordinal - right.ordinal);
}

function* loadVersionLineage(
  driver: DatabaseDriver,
  objectId: string,
  versionId: string | null,
  visited: Map<string, string>,
  known: Set<string>,
  onIdentity?: (row: Pick<SyncPackNodeVersionRow, 'version_id' | 'object_id'>) => void,
  required = false
): Generator<SyncPackNodeVersionRow> {
  if (versionId === null) return;
  const visitedObjectId = visited.get(versionId);
  if (visitedObjectId !== undefined) {
    if (visitedObjectId !== objectId) throw new Error(`sync_pack_node_version_cross_object:${versionId}`);
    return;
  }
  const identity = driver.queryOne<Pick<SyncPackNodeVersionRow,
    'version_id' | 'object_id' | 'parent_version_id'>>(
    `SELECT version_id, object_id, parent_version_id
     FROM node_sync_versions WHERE version_id = ?`,
    [versionId]
  );
  if (!identity) {
    if (required) throw new Error(`sync_pack_node_version_missing:${versionId}`);
    return;
  }
  if (identity.object_id !== objectId) {
    throw new Error(`sync_pack_node_version_cross_object:${versionId}`);
  }
  visited.set(versionId, objectId);
  for (const parentVersionId of loadParentVersionIds(driver, identity)) {
    yield* loadVersionLineage(driver, objectId, parentVersionId, visited, known, onIdentity);
  }
  onIdentity?.(identity);
  if (known.has(versionId)) return;
  const row = driver.queryOne<SyncPackNodeVersionRow>(
    `SELECT ${SYNC_PACK_NODE_VERSION_COLUMNS.join(', ')}
     FROM node_sync_versions WHERE version_id = ?`, [versionId]);
  if (!row) throw new Error(`sync_pack_node_version_missing:${versionId}`);
  assertValidNodeVersionSnapshot(row);
  yield { ...row, snapshot_json: projectTopicTextPackSnapshot(driver, row.snapshot_json, row.body_text) };
}

function loadParentVersionIds(driver: DatabaseDriver,
  row: Pick<SyncPackNodeVersionRow, 'version_id' | 'parent_version_id'>) {
  const rows = driver.queryAll<{ parent_version_id: string }>(
    `SELECT parent_version_id FROM node_sync_version_parents
     WHERE version_id = ? ORDER BY ordinal ASC`,
    [row.version_id]
  );
  if (rows.length > 0) return rows.map((parent) => parent.parent_version_id);
  return row.parent_version_id ? [row.parent_version_id] : [];
}
