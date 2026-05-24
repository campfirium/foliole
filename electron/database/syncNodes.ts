import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { openDatabaseConnection } from './connection.js';
import { isConflictCopyNodeId } from './syncConflictCopyIdentity.js';

interface SyncNodeRow extends DatabaseRow {
  anchor_link: string | null;
  body_blob_hash: string | null;
  content: string;
  content_hash: string | null;
  created_at: string;
  current_version_id: string | null;
  deleted_at: string | null;
  desired_retention: number | null;
  enable_short_term: number | null;
  device_id: string | null;
  manual_child_order: string | null;
  hide_title_heading: number;
  id: string;
  image_regions: string | null;
  is_title_manual: number;
  kind: string;
  opening_text: string | null;
  parent_id: string | null;
  parent_version_id: string | null;
  position: number | null;
  priority: number | null;
  reveal: string | null;
  sequential_reading_enabled: number | null;
  snapshot_json: string | null;
  title: string;
  updated_at: string;
  version_created_at: string | null;
  version_id: string | null;
  virtual_filter: string | null;
}

interface NodeAttachmentRefRow extends DatabaseRow {
  attachment_id: string;
  role: string;
}

interface NodeSyncVersionParentRow extends DatabaseRow {
  parent_version_id: string | null;
}

function listNodeAttachmentRefs(nodeId: string) {
  return openDatabaseConnection().driver.queryAll<NodeAttachmentRefRow>(
    `SELECT attachment_id, role
     FROM node_attachments
     WHERE node_id = ?
     ORDER BY attachment_id ASC, role ASC`,
    [nodeId]
  );
}

function listAncestorVersionIds(versionId: string | null) {
  if (!versionId) {
    return [];
  }
  const driver = openDatabaseConnection().driver;
  const ancestors: string[] = [];
  let cursor = driver.queryOne<NodeSyncVersionParentRow>(
    `SELECT parent_version_id
     FROM node_sync_versions
     WHERE version_id = ?`,
    [versionId]
  )?.parent_version_id ?? null;

  while (cursor) {
    ancestors.push(cursor);
    cursor = driver.queryOne<NodeSyncVersionParentRow>(
      `SELECT parent_version_id
       FROM node_sync_versions
       WHERE version_id = ?`,
      [cursor]
    )?.parent_version_id ?? null;
  }
  return ancestors;
}

function fallbackSnapshot(row: SyncNodeRow): NativeSyncNodeRecord['snapshot'] {
  return {
    anchor_link: row.anchor_link,
    attachments: listNodeAttachmentRefs(row.id),
    body_blob_hash: row.body_blob_hash,
    content: row.content,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
    desired_retention: row.desired_retention,
    enable_short_term: row.enable_short_term === null ? null : row.enable_short_term === 1,
    manual_child_order: row.manual_child_order,
    hide_title_heading: row.hide_title_heading === 1,
    id: row.id,
    image_regions: row.image_regions,
    is_title_manual: row.is_title_manual === 1,
    kind: row.kind,
    opening_text: row.opening_text,
    parent_id: row.parent_id,
    position: row.position,
    priority: row.priority,
    reveal: row.reveal,
    sequential_reading_enabled: row.sequential_reading_enabled === null ? null : row.sequential_reading_enabled === 1,
    title: row.title,
    updated_at: row.updated_at,
    virtual_filter: row.virtual_filter
  };
}

function parseSnapshot(row: SyncNodeRow): NativeSyncNodeRecord['snapshot'] {
  if (!row.snapshot_json) {
    return fallbackSnapshot(row);
  }
  try {
    return JSON.parse(row.snapshot_json) as NativeSyncNodeRecord['snapshot'];
  } catch {
    return fallbackSnapshot(row);
  }
}

function toNativeSyncNodeRecord(row: SyncNodeRow): NativeSyncNodeRecord {
  const snapshot = parseSnapshot(row);
  return {
    ancestor_version_ids: listAncestorVersionIds(row.version_id),
    content_hash: row.content_hash,
    device_id: row.device_id,
    object_id: snapshot.id,
    object_type: 'node',
    parent_version_id: row.parent_version_id,
    snapshot,
    updated_at: snapshot.updated_at,
    version_created_at: row.version_created_at,
    version_id: row.version_id
  };
}

const SYNC_NODE_SELECT_COLUMNS = `
  n.id,
  n.parent_id,
  n.kind,
  n.priority,
  n.desired_retention,
  n.enable_short_term,
  n.sequential_reading_enabled,
  n.manual_child_order,
  n.title,
  n.is_title_manual,
  n.hide_title_heading,
  n.content,
  n.body_blob_hash,
  n.opening_text,
  n.virtual_filter,
  n.reveal,
  n.anchor_link,
  n.image_regions,
  node_order.position,
  n.current_version_id,
  n.created_at,
  n.updated_at,
  n.deleted_at,
  v.version_id,
  v.device_id,
  v.created_at AS version_created_at,
  v.parent_version_id,
  v.content_hash,
  v.snapshot_json`;

export function loadSyncNodes(objectIds: string[]) {
  if (objectIds.length === 0) {
    return [];
  }
  const placeholders = objectIds.map(() => '?').join(', ');
  const rows = openDatabaseConnection().driver.queryAll<SyncNodeRow>(
    `SELECT
       ${SYNC_NODE_SELECT_COLUMNS}
     FROM nodes n
     LEFT JOIN node_order ON node_order.node_id = n.id
     LEFT JOIN node_sync_versions v
       ON v.version_id = n.current_version_id
     WHERE n.id IN (${placeholders})
     ORDER BY n.updated_at ASC, n.id ASC`,
    objectIds
  );

  return rows.map((row) => toNativeSyncNodeRecord(row));
}

export function loadSyncNodeVersionsSince(cursor: { createdAt: string; versionId: string } | null, limit = 500) {
  const rows = openDatabaseConnection().driver.queryAll<SyncNodeRow>(
    `SELECT
       ${SYNC_NODE_SELECT_COLUMNS}
     FROM nodes n
     LEFT JOIN node_order ON node_order.node_id = n.id
     INNER JOIN node_sync_versions v
       ON v.object_id = n.id
     WHERE ${cursor ? '(v.created_at > ? OR (v.created_at = ? AND v.version_id > ?))' : '1 = 1'}
       AND n.id NOT LIKE 'conflict-copy-%'
     ORDER BY v.created_at ASC, v.version_id ASC
     LIMIT ?`,
    cursor
      ? [cursor.createdAt, cursor.createdAt, cursor.versionId, Math.max(1, Math.min(1000, Math.trunc(limit)))]
      : [Math.max(1, Math.min(1000, Math.trunc(limit)))]
  );

  return rows.filter((row) => !isConflictCopyNodeId(row.id)).map((row) => toNativeSyncNodeRecord(row));
}
