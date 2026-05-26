import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';

import { openDatabaseConnection } from './connection.js';

export interface NodeSyncVersionSourceRow extends DatabaseRow {
  anchor_link: string | null;
  body_blob_hash: string | null;
  content: string;
  created_at: string;
  current_version_id: string | null;
  deleted_at: string | null;
  desired_retention: number | null;
  enable_short_term: number | null;
  sequential_reading_enabled: number | null;
  shelved_at: string | null;
  manual_child_order: string | null;
  hide_title_heading: number;
  id: string;
  image_regions: string | null;
  is_title_manual: number;
  kind: string;
  opening_text: string | null;
  parent_id: string | null;
  position: number | null;
  priority: number | null;
  reveal: string | null;
  sync_dirty: number;
  title: string;
  updated_at: string;
  virtual_filter: string | null;
}

interface NodeAttachmentRefRow extends DatabaseRow {
  attachment_id: string;
  role: string;
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

export function loadNodeSyncVersionSource(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<NodeSyncVersionSourceRow>(
    `SELECT
       id,
       parent_id,
       kind,
       priority,
       desired_retention,
       enable_short_term,
       sequential_reading_enabled,
       shelved_at,
       manual_child_order,
       title,
       is_title_manual,
       hide_title_heading,
       content,
       body_blob_hash,
       opening_text,
       virtual_filter,
       reveal,
       anchor_link,
       image_regions,
       node_order.position AS position,
       current_version_id,
       sync_dirty,
       created_at,
       updated_at,
       deleted_at
     FROM nodes
     LEFT JOIN node_order ON node_order.node_id = nodes.id
     WHERE nodes.id = ?`,
    [nodeId]
  );
}

export function buildNodeSyncSnapshot(row: NodeSyncVersionSourceRow, nodeId: string) {
  return {
    anchor_link: row.anchor_link,
    attachments: listNodeAttachmentRefs(nodeId),
    body_blob_hash: row.body_blob_hash,
    content: '',
    created_at: row.created_at,
    deleted_at: row.deleted_at,
    desired_retention: row.desired_retention,
    enable_short_term: row.enable_short_term === null ? null : row.enable_short_term === 1,
    sequential_reading_enabled: row.sequential_reading_enabled === null ? null : row.sequential_reading_enabled === 1,
    shelved_at: row.shelved_at,
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
    title: row.title,
    updated_at: row.updated_at,
    virtual_filter: row.virtual_filter
  };
}

export function computeNodeSyncVersionHash(row: NodeSyncVersionSourceRow, nodeId: string) {
  return computeNodeSyncHash({
    anchorLink: row.anchor_link,
    attachments: listNodeAttachmentRefs(nodeId).map((attachment) => ({
      attachmentId: attachment.attachment_id,
      role: attachment.role
    })),
    content: row.content,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    desiredRetention: row.desired_retention,
    enableShortTerm: row.enable_short_term === null ? null : row.enable_short_term === 1,
    sequentialReadingEnabled: row.sequential_reading_enabled === null ? null : row.sequential_reading_enabled === 1,
    shelvedAt: row.shelved_at,
    manualChildOrder: row.manual_child_order,
    hideTitleHeading: row.hide_title_heading === 1,
    id: row.id,
    imageRegions: row.image_regions,
    isTitleManual: row.is_title_manual === 1,
    kind: row.kind,
    openingText: row.opening_text,
    parentId: row.parent_id,
    position: row.position,
    priority: row.priority,
    reveal: row.reveal,
    title: row.title,
    updatedAt: row.updated_at,
    virtualFilter: row.virtual_filter
  });
}
