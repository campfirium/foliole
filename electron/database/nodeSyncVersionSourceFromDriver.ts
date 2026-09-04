import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import type { NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';

export interface NodeSyncVersionSourceRow extends DatabaseRow, NodeBodyRow {
  anchor_link: string | null;
  anchor_resolution_status: 'resolved' | 'unmapped_ambiguous' | 'unmapped_missing' | null;
  anchor_source_version_id: string | null;
  body_blob_hash: string | null;
  body_blob_data: unknown;
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
  import_content_fingerprint: string | null;
  import_source_fingerprint: string | null;
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

function listNodeAttachmentRefs(driver: DatabaseDriver, nodeId: string) {
  return driver.queryAll<NodeAttachmentRefRow>(
    `SELECT attachment_id, role FROM node_attachments
     WHERE node_id = ? ORDER BY attachment_id ASC, role ASC`,
    [nodeId]
  );
}

export function loadNodeSyncVersionSourceFromDriver(driver: DatabaseDriver, nodeId: string) {
  return driver.queryOne<NodeSyncVersionSourceRow>(
    `SELECT id, parent_id, kind, priority, desired_retention, enable_short_term,
       sequential_reading_enabled, shelved_at, manual_child_order, title, is_title_manual,
       hide_title_heading, content, nodes.body_blob_hash, cbd.data AS body_blob_data,
       opening_text, virtual_filter, reveal,
       anchor_link, anchor_resolution_status, anchor_source_version_id, image_regions, import_content_fingerprint, import_source_fingerprint,
       node_order.position AS position, current_version_id, sync_dirty, created_at, updated_at, deleted_at
     FROM nodes
     LEFT JOIN node_order ON node_order.node_id = nodes.id
     LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash
     WHERE nodes.id = ?`,
    [nodeId]
  );
}

export function buildNodeSyncSnapshotFromDriver(
  driver: DatabaseDriver,
  row: NodeSyncVersionSourceRow,
  nodeId: string
) {
  return {
    anchor_link: row.anchor_link,
    anchor_resolution_status: row.anchor_resolution_status,
    anchor_source_version_id: row.anchor_source_version_id,
    attachments: listNodeAttachmentRefs(driver, nodeId),
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
    import_content_fingerprint: row.import_content_fingerprint,
    import_source_fingerprint: row.import_source_fingerprint,
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

export function computeNodeSyncVersionHashFromDriver(
  driver: DatabaseDriver,
  row: NodeSyncVersionSourceRow,
  nodeId: string
) {
  return computeNodeSyncHash({
    anchorLink: row.anchor_link,
    anchorResolutionStatus: row.anchor_resolution_status,
    anchorSourceVersionId: row.anchor_source_version_id,
    attachments: listNodeAttachmentRefs(driver, nodeId).map((item) => ({
      attachmentId: item.attachment_id,
      role: item.role
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
    importContentFingerprint: row.import_content_fingerprint,
    importSourceFingerprint: row.import_source_fingerprint,
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
