import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { parseNodeResourceReferences } from '../database/nodeResourceReferences.js';
import { buildCanonicalNodeSyncPayload, type NodeSyncHashInput } from '../database/nodeSyncPayload.js';

import { FRAMED_SYNC_NODE_VERSION_FACT } from './framedSyncNodeFactContract.js';

export function matchingTombstoneVersionSql(version: string, tomb: string) {
  const fields = FRAMED_SYNC_NODE_VERSION_FACT.snapshotFields.filter((field) =>
    !['body_blob_hash', 'position'].includes(field));
  return `${version}.version_id = ${tomb}.version_id AND ${version}.object_id = ${tomb}.node_id
    AND ${version}.content_hash = ${tomb}.content_hash
    AND ${version}.parent_version_id IS ${tomb}.parent_version_id
    AND ${version}.host_name = ${tomb}.host_name AND ${version}.created_at = ${tomb}.created_at
    AND ${version}.body_text IS NOT NULL AND ${fields.map((field) =>
    `json_extract(${version}.snapshot_json, '$.${field}') IS json_extract(${tomb}.snapshot_json, '$.${field}')`).join(' AND ')}`;
}

function snapshotInput(snapshot: NativeSyncNodeRecord['snapshot'], body: string): NodeSyncHashInput {
  return {
    anchorLink: snapshot.anchor_link, anchorResolutionStatus: snapshot.anchor_resolution_status ?? null,
    anchorSourceVersionId: snapshot.anchor_source_version_id ?? null,
    attachments: snapshot.attachments.map((item) => ({ attachmentId: item.attachment_id, role: item.role })),
    ...(snapshot.resource_references === undefined ? {} : {
      resourceReferences: parseNodeResourceReferences(snapshot.resource_references)
    }),
    content: body, createdAt: snapshot.created_at, deletedAt: snapshot.deleted_at,
    desiredRetention: snapshot.desired_retention, enableShortTerm: snapshot.enable_short_term ?? null,
    sequentialReadingEnabled: snapshot.sequential_reading_enabled ?? null, shelvedAt: snapshot.shelved_at ?? null,
    manualChildOrder: snapshot.manual_child_order ?? null, hideTitleHeading: snapshot.hide_title_heading,
    id: snapshot.id, imageRegions: snapshot.image_regions, imageSources: snapshot.image_sources ?? null,
    importContentFingerprint: snapshot.import_content_fingerprint ?? null,
    importSourceFingerprint: snapshot.import_source_fingerprint ?? null,
    isTitleManual: snapshot.is_title_manual, kind: snapshot.kind, openingText: snapshot.opening_text,
    parentId: snapshot.parent_id, priority: snapshot.priority, reveal: snapshot.reveal,
    title: snapshot.title, updatedAt: snapshot.updated_at, virtualFilter: snapshot.virtual_filter
  };
}

/** A transport empty body is not evidence of an original empty version. */
export function hasCompleteTombstoneVersion(record: NativeSyncNodeRecord) {
  if (!record.is_tombstone || record.body_text === null || record.body_text === undefined ||
      !record.version_id || !record.host_name || !record.version_created_at ||
      record.snapshot.id !== record.object_id || !record.snapshot.deleted_at) return false;
  const payload = buildCanonicalNodeSyncPayload(snapshotInput(record.snapshot, record.body_text));
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(payload)))) === record.content_hash;
}
