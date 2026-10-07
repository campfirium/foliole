import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import type { NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { parseNodeResourceReferences, projectNodeResourceLinks } from '../../lib/core/database/nodeResourceReferences.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { loadTopicTextStateWithDriver } from '../../lib/core/database/topicTextStateWithDriver.js';
import { normalizeTextAlternatives, normalizeTextAlternativesForHash } from '../../lib/core/sync/topicTextState.js';

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
  image_sources: string | null;
  resource_references: string;
  import_content_fingerprint: string | null;
  import_source_fingerprint: string | null;
  is_title_manual: number;
  kind: string;
  opening_text: string | null;
  parent_id: string | null;
  priority: number | null;
  reveal: string | null;
  sync_dirty: number;
  title: string;
  updated_at: string;
  virtual_filter: string | null;
}

export function loadNodeSyncVersionSourceFromDriver(driver: DatabaseDriver, nodeId: string,
  storage: 'continuous' | 'chunked' = 'continuous') {
  return driver.queryOne<NodeSyncVersionSourceRow>(
    `SELECT id, parent_id, kind, priority, desired_retention, enable_short_term,
       sequential_reading_enabled, shelved_at, manual_child_order, title, is_title_manual,
       hide_title_heading, ${storage === 'continuous' ? 'content, nodes.body_blob_hash, cbd.data AS body_blob_data' : "'' AS content, nodes.body_blob_hash, NULL AS body_blob_data"},
       opening_text, virtual_filter, reveal,
       anchor_link, anchor_resolution_status, anchor_source_version_id, image_regions, image_sources, resource_references, import_content_fingerprint, import_source_fingerprint,
       current_version_id, sync_dirty, created_at, updated_at, deleted_at
     FROM nodes
     ${storage === 'continuous' ? 'LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash' : ''}
     WHERE nodes.id = ?`,
    [nodeId]
  );
}

export function buildNodeSyncSnapshotFromDriver(
  driver: DatabaseDriver,
  row: NodeSyncVersionSourceRow,
  nodeId: string,
  bodyHash?: string
) {
  return {
    text_alternatives: bodyHash === undefined
      ? normalizeTextAlternatives(loadTopicTextStateWithDriver(driver, nodeId), row.content ?? '', row.updated_at)
      : normalizeTextAlternativesForHash(loadTopicTextStateWithDriver(driver, nodeId), bodyHash, row.updated_at),
    anchor_link: row.anchor_link,
    anchor_resolution_status: row.anchor_resolution_status,
    anchor_source_version_id: row.anchor_source_version_id,
    attachments: projectNodeResourceLinks(row.resource_references),
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
    id: nodeId,
    image_regions: row.image_regions,
    image_sources: row.image_sources,
    resource_references: row.resource_references,
    import_content_fingerprint: row.import_content_fingerprint,
    import_source_fingerprint: row.import_source_fingerprint,
    is_title_manual: row.is_title_manual === 1,
    kind: row.kind,
    opening_text: row.opening_text,
    parent_id: row.parent_id,
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
    textAlternatives: normalizeTextAlternatives(loadTopicTextStateWithDriver(driver, nodeId), row.content ?? '', row.updated_at),
    anchorLink: row.anchor_link,
    anchorResolutionStatus: row.anchor_resolution_status,
    anchorSourceVersionId: row.anchor_source_version_id,
    attachments: projectNodeResourceLinks(row.resource_references).map((item) => ({
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
    id: nodeId,
    imageRegions: row.image_regions,
    imageSources: row.image_sources,
    resourceReferences: parseNodeResourceReferences(row.resource_references),
    importContentFingerprint: row.import_content_fingerprint,
    importSourceFingerprint: row.import_source_fingerprint,
    isTitleManual: row.is_title_manual === 1,
    kind: row.kind,
    openingText: row.opening_text,
    parentId: row.parent_id,
    priority: row.priority,
    reveal: row.reveal,
    title: row.title,
    updatedAt: row.updated_at,
    virtualFilter: row.virtual_filter
  });
}
