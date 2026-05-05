import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeStorageContract.js';

import { openDatabaseConnection } from './connection.js';

interface SyncNodeRow extends DatabaseRow {
  anchor_link: string | null;
  content: string;
  content_hash: string | null;
  created_at: string;
  current_version_id: string | null;
  deleted_at: string | null;
  desired_retention: number | null;
  device_id: string | null;
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
  title: string;
  updated_at: string;
  version_created_at: string | null;
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

function toNativeSyncNodeRecord(row: SyncNodeRow): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: listAncestorVersionIds(row.current_version_id),
    content_hash: row.content_hash,
    device_id: row.device_id,
    object_id: row.id,
    object_type: 'node',
    parent_version_id: row.parent_version_id,
    snapshot: {
      anchor_link: row.anchor_link,
      attachments: listNodeAttachmentRefs(row.id),
      content: row.content,
      created_at: row.created_at,
      deleted_at: row.deleted_at,
      desired_retention: row.desired_retention,
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
      title: row.title,
      updated_at: row.updated_at,
      virtual_filter: row.virtual_filter
    },
    updated_at: row.updated_at,
    version_created_at: row.version_created_at,
    version_id: row.current_version_id
  };
}

export function loadSyncNodes(objectIds: string[]) {
  if (objectIds.length === 0) {
    return [];
  }
  const placeholders = objectIds.map(() => '?').join(', ');
  const rows = openDatabaseConnection().driver.queryAll<SyncNodeRow>(
    `SELECT
       n.id,
       n.parent_id,
       n.kind,
       n.priority,
       n.desired_retention,
       n.title,
       n.is_title_manual,
       n.hide_title_heading,
       n.content,
       n.opening_text,
       n.virtual_filter,
       n.reveal,
       n.anchor_link,
       n.image_regions,
       n.position,
       n.current_version_id,
       n.created_at,
       n.updated_at,
       n.deleted_at,
       v.device_id,
       v.created_at AS version_created_at,
       v.parent_version_id,
       v.content_hash
     FROM nodes n
     LEFT JOIN node_sync_versions v
       ON v.version_id = n.current_version_id
     WHERE n.id IN (${placeholders})
     ORDER BY n.updated_at ASC, n.id ASC`,
    objectIds
  );

  return rows.map((row) => toNativeSyncNodeRecord(row));
}
