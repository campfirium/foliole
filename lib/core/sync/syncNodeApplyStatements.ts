import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { normalizeNodeImportProvenance } from '../database/nodeImportProvenance.js';
import { projectNodeInlineContent } from '../database/nodeInlineProjection.js';
import { parseNodeResourceReferences, serializeNodeResourceReferences } from '../database/nodeResourceReferences.js';

import type { DbParams } from './dbPort.js';

export interface SyncNodeStatement {
  params: DbParams;
  sql: string;
}

export const UPSERT_REMOTE_NODE_SQL = `INSERT INTO nodes (
  id, parent_id, kind, priority, desired_retention, enable_short_term, sequential_reading_enabled, shelved_at, manual_child_order, title, is_title_manual, hide_title_heading,
  content, body_blob_hash, opening_text, virtual_filter, reveal, anchor_link, anchor_resolution_status, anchor_source_version_id, image_regions, image_sources, resource_references,
  import_source_fingerprint, import_content_fingerprint,
  current_version_id, last_modified_by_host_name, sync_dirty, created_at, updated_at, deleted_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  parent_id = excluded.parent_id,
  kind = excluded.kind,
  priority = excluded.priority,
  desired_retention = excluded.desired_retention,
  enable_short_term = excluded.enable_short_term,
  sequential_reading_enabled = excluded.sequential_reading_enabled,
  shelved_at = excluded.shelved_at,
  manual_child_order = excluded.manual_child_order,
  title = excluded.title,
  is_title_manual = excluded.is_title_manual,
  hide_title_heading = excluded.hide_title_heading,
  content = excluded.content,
  body_blob_hash = excluded.body_blob_hash,
  opening_text = excluded.opening_text,
  virtual_filter = excluded.virtual_filter,
  reveal = excluded.reveal,
  anchor_link = excluded.anchor_link,
  anchor_resolution_status = excluded.anchor_resolution_status,
  anchor_source_version_id = excluded.anchor_source_version_id,
  image_regions = excluded.image_regions,
  image_sources = excluded.image_sources,
  resource_references = excluded.resource_references,
  import_source_fingerprint = excluded.import_source_fingerprint,
  import_content_fingerprint = excluded.import_content_fingerprint,
  current_version_id = excluded.current_version_id,
  last_modified_by_host_name = excluded.last_modified_by_host_name,
  sync_dirty = excluded.sync_dirty,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  deleted_at = excluded.deleted_at`;

export const UPDATE_REMOTE_NODE_SQL = `UPDATE nodes SET
  parent_id = ?, kind = ?, priority = ?, desired_retention = ?, enable_short_term = ?,
  sequential_reading_enabled = ?, shelved_at = ?, manual_child_order = ?, title = ?,
  is_title_manual = ?, hide_title_heading = ?, content = ?, body_blob_hash = ?,
  opening_text = ?, virtual_filter = ?, reveal = ?, anchor_link = ?,
  anchor_resolution_status = ?, anchor_source_version_id = ?, image_regions = ?, image_sources = ?, resource_references = ?,
  import_source_fingerprint = ?, import_content_fingerprint = ?,
  current_version_id = ?, last_modified_by_host_name = ?, sync_dirty = ?,
  created_at = ?, updated_at = ?, deleted_at = ?
WHERE id = ?`;

export const UPSERT_REMOTE_NODE_VERSION_SQL = `INSERT INTO node_sync_versions (
  version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(version_id) DO NOTHING`;



export function buildRemoteNodeUpsert(
  record: NativeSyncNodeRecord,
  bodyBlobHash: string,
  syncDirty = 0
): SyncNodeStatement {
  return {
    params: buildRemoteNodeParams(record, bodyBlobHash, syncDirty),
    sql: UPSERT_REMOTE_NODE_SQL
  };
}

export function buildRemoteNodeUpdate(
  record: NativeSyncNodeRecord,
  bodyBlobHash: string,
  syncDirty = 0
): SyncNodeStatement {
  const params = buildRemoteNodeParams(record, bodyBlobHash, syncDirty);
  return {
    params: [...params.slice(1), params[0]!],
    sql: UPDATE_REMOTE_NODE_SQL
  };
}

function buildRemoteNodeParams(record: NativeSyncNodeRecord, bodyBlobHash: string, syncDirty: number): DbParams {
  const { snapshot } = record;
  const provenance = normalizeNodeImportProvenance({
    importContentFingerprint: snapshot.import_content_fingerprint,
    importSourceFingerprint: snapshot.import_source_fingerprint
  });
  return [
      snapshot.id,
      snapshot.parent_id,
      snapshot.kind,
      snapshot.priority,
      snapshot.desired_retention,
      snapshot.enable_short_term == null ? null : snapshot.enable_short_term ? 1 : 0,
      snapshot.sequential_reading_enabled == null ? null : snapshot.sequential_reading_enabled ? 1 : 0,
      snapshot.shelved_at ?? null,
      snapshot.manual_child_order ?? null,
      snapshot.title,
      snapshot.is_title_manual ? 1 : 0,
      snapshot.hide_title_heading ? 1 : 0,
      projectNodeInlineContent(snapshot.content ?? ''),
      bodyBlobHash,
      snapshot.opening_text,
      snapshot.virtual_filter,
      snapshot.reveal,
      snapshot.anchor_link,
      snapshot.anchor_resolution_status ?? null,
      snapshot.anchor_source_version_id ?? null,
      snapshot.image_regions,
      snapshot.image_sources ?? null,
      serializeNodeResourceReferences(parseNodeResourceReferences(snapshot.resource_references)),
      provenance.importSourceFingerprint,
      provenance.importContentFingerprint,
      record.version_id,
      record.host_name,
      syncDirty,
      snapshot.created_at,
      snapshot.updated_at,
      snapshot.deleted_at
    ];
}

export function buildRemoteNodeVersionUpsert(record: NativeSyncNodeRecord): SyncNodeStatement | null {
  if (!record.version_id || !record.host_name || !record.version_created_at) {
    return null;
  }
  return {
    params: [
      record.version_id,
      record.object_id,
      record.parent_version_id,
      record.host_name,
      record.version_created_at,
      record.content_hash ?? '',
      record.body_text === null && record.snapshot.content === null
        ? null : record.body_text ?? record.snapshot.content ?? '',
      JSON.stringify(record.snapshot)
    ],
    sql: UPSERT_REMOTE_NODE_VERSION_SQL
  };
}
