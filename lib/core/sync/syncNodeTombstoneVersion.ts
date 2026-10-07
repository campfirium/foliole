import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { buildCanonicalNodeSyncPayload } from '../database/nodeSyncPayload.js';
import { nodeSyncSnapshotHashMetadata } from '../database/nodeSyncSnapshotMetadata.js';

import { FRAMED_SYNC_NODE_VERSION_FACT } from './framedSyncNodeFactContract.js';

export type NodeVersionBodyStorage = 'continuous' | 'chunked';

export function matchingTombstoneVersionSql(version: string, tomb: string, bodyStorage: NodeVersionBodyStorage = 'continuous') {
  const fields = FRAMED_SYNC_NODE_VERSION_FACT.snapshotFields.filter((field) =>
    !['body_blob_hash', 'position'].includes(field));
  return `${version}.version_id = ${tomb}.version_id AND ${version}.object_id = ${tomb}.node_id
    AND ${version}.content_hash = ${tomb}.content_hash
    AND ${version}.parent_version_id IS ${tomb}.parent_version_id
    AND ${version}.host_name = ${tomb}.host_name AND ${version}.created_at = ${tomb}.created_at
    AND ${bodyStorage === 'chunked' ? `${version}.body_state = 'readable'` : `${version}.body_text IS NOT NULL`} AND ${fields.map((field) =>
    `json_extract(${version}.snapshot_json, '$.${field}') IS json_extract(${tomb}.snapshot_json, '$.${field}')`).join(' AND ')}`;
}

/** A transport empty body is not evidence of an original empty version. */
export function hasCompleteTombstoneVersion(record: NativeSyncNodeRecord) {
  if (!record.is_tombstone || record.body_text === null || record.body_text === undefined ||
      !record.version_id || !record.host_name || !record.version_created_at ||
      record.snapshot.id !== record.object_id || !record.snapshot.deleted_at) return false;
  const payload = buildCanonicalNodeSyncPayload({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content: record.body_text });
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(payload)))) === record.content_hash;
}
