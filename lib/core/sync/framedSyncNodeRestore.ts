import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type {
  CanonicalBlob,
  CanonicalFact,
  CanonicalField,
  CanonicalValue
} from './framedSyncCanonicalManifest.js';
import {
  assertNodeVersionFactShape,
  framedSyncMainBodyBlob,
  isFramedSyncNodeIdentityFact,
  FRAMED_SYNC_NODE_VERSION_FACT
} from './framedSyncNodeFactContract.js';
import { restoreTopicTextBodyBlobs } from './topicTextFramedBodies.js';
import { textAlternativesSchema, type TopicTextBody } from './topicTextState.js';

const decoder = new TextDecoder('utf-8', { fatal: true });

function fieldsByName(fields: readonly CanonicalField[], expected: readonly string[], error: string) {
  const result = new Map(fields.map((entry) => [entry.name, entry.value]));
  if (result.size !== fields.length || result.size !== expected.length ||
      expected.some((name) => !result.has(name))) throw new Error(error);
  return result;
}

function requiredValue(fields: ReadonlyMap<string, CanonicalValue>, name: string) {
  const value = fields.get(name);
  if (!value) throw new Error(`node_version_fact_field_missing:${name}`);
  return value;
}

function readString(value: CanonicalValue, nullable = false): string | null {
  if (nullable && value.kind === 'null') return null;
  if (value.kind !== 'string') throw new Error('node_version_fact_string_invalid');
  return value.value;
}

function readBool(value: CanonicalValue, nullable = false): boolean | null {
  if (nullable && value.kind === 'null') return null;
  if (value.kind !== 'bool') throw new Error('node_version_fact_bool_invalid');
  return value.value;
}

function readNumber(value: CanonicalValue): number | null {
  if (value.kind === 'null') return null;
  if (value.kind !== 'signed' || value.value < BigInt(Number.MIN_SAFE_INTEGER) ||
      value.value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('node_version_fact_number_invalid');
  return Number(value.value);
}

function readStringList(value: CanonicalValue) {
  if (value.kind !== 'list') throw new Error('node_version_fact_string_list_invalid');
  return value.value.map((entry) => {
    const decoded = readString(entry);
    if (decoded === null) throw new Error('node_version_fact_string_list_invalid');
    return decoded;
  });
}

function readAnchorResolution(value: CanonicalValue) {
  const decoded = readString(value, true);
  if (decoded === null || decoded === 'resolved' || decoded === 'unmapped_ambiguous' ||
      decoded === 'unmapped_missing') return decoded;
  throw new Error('node_version_fact_anchor_resolution_invalid');
}

function readSnapshot(value: CanonicalValue): NativeSyncNodeRecord['snapshot'] {
  if (value.kind !== 'object') throw new Error('node_version_fact_snapshot_invalid');
  const values = fieldsByName(value.value, FRAMED_SYNC_NODE_VERSION_FACT.snapshotFields,
    'node_version_fact_snapshot_shape_invalid');
  const get = (name: string) => requiredValue(values, name);
  const attachments = get('attachments');
  if (attachments.kind !== 'list') throw new Error('node_version_fact_attachments_invalid');
  const resourceReferences = readString(get('resource_references'), true);
  return {
    anchor_link: readString(get('anchor_link'), true),
    anchor_resolution_status: readAnchorResolution(get('anchor_resolution_status')),
    anchor_source_version_id: readString(get('anchor_source_version_id'), true),
    attachments: attachments.value.map((entry) => {
      if (entry.kind !== 'object') throw new Error('node_version_fact_attachments_invalid');
      const item = fieldsByName(entry.value, ['attachment_id', 'role'],
        'node_version_fact_attachments_invalid');
      return { attachment_id: readString(requiredValue(item, 'attachment_id'))!,
        role: readString(requiredValue(item, 'role'))! };
    }),
    body_blob_hash: readString(get('body_blob_hash'), true),
    ...(readString(get('text_alternatives'), true) === null ? {} : {
      text_alternatives: textAlternativesSchema.parse(JSON.parse(readString(get('text_alternatives'))!))
    }),
    ...(readString(get('text_selection'), true) === null ? {} : {
      text_selection: z.object({ version_id: z.string().min(1), created_at: z.string().datetime() })
        .parse(JSON.parse(readString(get('text_selection'))!))
    }),
    created_at: readString(get('created_at'))!,
    deleted_at: readString(get('deleted_at'), true),
    desired_retention: readNumber(get('desired_retention')),
    enable_short_term: readBool(get('enable_short_term'), true),
    hide_title_heading: readBool(get('hide_title_heading'))!,
    id: readString(get('id'))!,
    image_regions: readString(get('image_regions'), true),
    image_sources: readString(get('image_sources'), true),
    import_content_fingerprint: readString(get('import_content_fingerprint'), true),
    import_source_fingerprint: readString(get('import_source_fingerprint'), true),
    is_title_manual: readBool(get('is_title_manual'))!,
    kind: readString(get('kind'))!,
    manual_child_order: readString(get('manual_child_order'), true),
    opening_text: readString(get('opening_text'), true),
    parent_id: readString(get('parent_id'), true),
    position: readNumber(get('position')),
    priority: readNumber(get('priority')),
    ...(resourceReferences === null ? {} : { resource_references: resourceReferences }),
    reveal: readString(get('reveal'), true),
    sequential_reading_enabled: readBool(get('sequential_reading_enabled'), true),
    shelved_at: readString(get('shelved_at'), true),
    title: readString(get('title'))!,
    updated_at: readString(get('updated_at'))!,
    virtual_filter: readString(get('virtual_filter'), true)
  };
}

function sameBlob(left: CanonicalBlob, right: CanonicalBlob) {
  return left.byteLength === right.byteLength && left.required === right.required && left.role === right.role &&
    left.sha256.length === right.sha256.length && left.sha256.every((byte, index) => right.sha256[index] === byte);
}

export function restoreFramedSyncNodeRecord(input: {
  bodyBlob: Uint8Array;
  fact: CanonicalFact;
  manifestBlob: CanonicalBlob;
  alternativeBodies?: readonly TopicTextBody[];
}): NativeSyncNodeRecord {
  const { bodyBlob, fact, manifestBlob } = input;
  assertNodeVersionFactShape(fact);
  const bodyDescriptors = [framedSyncMainBodyBlob(fact)].filter((blob): blob is CanonicalBlob => Boolean(blob));
  if (bodyDescriptors.length !== 1 || !sameBlob(bodyDescriptors[0]!, manifestBlob) ||
      manifestBlob.byteLength !== BigInt(bodyBlob.byteLength) ||
      !sameBlob(manifestBlob, { ...manifestBlob, sha256: sha256(bodyBlob) })) {
    throw new Error('node_version_projection_body_blob_invalid');
  }
  const record = restoreNodeFields(fact, decoder.decode(bodyBlob), bytesToHex(manifestBlob.sha256));
  return restoreTopicTextBodyBlobs(record, input.alternativeBodies ?? [], fact.blobs);
}

export function restoreFramedSyncNodeIdentityFact(fact: CanonicalFact): NativeSyncNodeRecord {
  assertNodeVersionFactShape(fact);
  if (!isFramedSyncNodeIdentityFact(fact)) throw new Error('node_version_identity_only_required');
  return restoreNodeFields(fact, null, null);
}

export type FramedSyncNodeMetadata = Omit<NativeSyncNodeRecord, 'body_text' | 'alternative_bodies' | 'snapshot'> & {
  snapshot: Omit<NativeSyncNodeRecord['snapshot'], 'content'>;
};

/** Restore only the signed node/version fields. Body ownership is verified independently. */
export function restoreFramedSyncNodeMetadata(fact: CanonicalFact): FramedSyncNodeMetadata {
  assertNodeVersionFactShape(fact);
  const retired = isFramedSyncNodeIdentityFact(fact);
  const body = framedSyncMainBodyBlob(fact);
  if (!retired && !body) throw new Error('node_version_projection_body_blob_invalid');
  const record = restoreNodeFields(fact, retired ? null : '', body ? bytesToHex(body.sha256) : null);
  const metadata = { ...record };
  delete metadata.body_text;
  delete metadata.alternative_bodies;
  const snapshotMetadata = { ...record.snapshot };
  delete snapshotMetadata.content;
  return { ...metadata, snapshot: snapshotMetadata };
}

function restoreNodeFields(fact: CanonicalFact, body: string | null, bodyHash: string | null): NativeSyncNodeRecord {
  const values = fieldsByName(fact.body, body === null ? [...FRAMED_SYNC_NODE_VERSION_FACT.bodyFields, 'body_retired'] :
      FRAMED_SYNC_NODE_VERSION_FACT.bodyFields,
    'node_version_fact_body_shape_invalid');
  const get = (name: string) => requiredValue(values, name);
  const contentHash = readString(get('content_hash'))!;
  if (bytesToHex(fact.sharedStateHash) !== contentHash) throw new Error('node_version_shared_state_hash_mismatch');
  const snapshot = readSnapshot(get('snapshot'));
  if (snapshot.id !== fact.globalId || (bodyHash !== null && snapshot.body_blob_hash !== bodyHash)) {
    throw new Error('node_version_projection_identity_invalid');
  }
  return {
    ancestor_version_ids: readStringList(get('ancestor_version_ids')),
    body_text: body,
    content_hash: contentHash,
    host_name: readString(get('host_name'), true),
    is_tombstone: readBool(get('is_tombstone'))!,
    object_id: fact.globalId,
    object_type: 'node',
    parent_version_id: readString(get('parent_version_id'), true),
    parent_version_ids: readStringList(get('parent_version_ids')),
    snapshot: body === null ? { ...snapshot, content: null } : snapshot,
    updated_at: readString(get('updated_at'))!,
    version_created_at: readString(get('version_created_at'), true),
    version_id: fact.factId
  };
}
