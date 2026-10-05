import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import {
  type CanonicalBlob,
  type CanonicalFact,
  type CanonicalField,
  type CanonicalManifest,
  type CanonicalValue
} from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import {
  assertNodeVersionFactShape,
  FRAMED_SYNC_NODE_VERSION_FACT
} from '../../lib/core/sync/framedSyncNodeFactContract.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

export type DesktopFramedSyncNodeProjection = Readonly<{ bodyBlob: Uint8Array; manifest: CanonicalManifest }>;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const scalarValue = (value: string | boolean | null | undefined): CanonicalValue => {
  if (value === null || value === undefined) return { kind: 'null' };
  return typeof value === 'string' ? { kind: 'string', value } : { kind: 'bool', value };
};
const numberValue = (value: number | null | undefined): CanonicalValue => {
  if (value === null || value === undefined) return { kind: 'null' };
  if (!Number.isSafeInteger(value)) throw new Error('node_version_fact_number_invalid');
  return { kind: 'signed', value: BigInt(value) };
};
const stringList = (values: readonly string[]): CanonicalValue => ({
  kind: 'list', value: values.map((value) => ({ kind: 'string', value }))
});
const field = (name: string, value: CanonicalValue): CanonicalField => ({ name, value });

function snapshotFields(snapshot: NativeSyncNodeRecord['snapshot'], bodyHash: string) {
  return [
    field('anchor_link', scalarValue(snapshot.anchor_link)),
    field('anchor_resolution_status', scalarValue(snapshot.anchor_resolution_status)),
    field('anchor_source_version_id', scalarValue(snapshot.anchor_source_version_id)),
    field('attachments', { kind: 'list', value: snapshot.attachments.map((attachment) => ({
      kind: 'object', value: [
        field('attachment_id', scalarValue(attachment.attachment_id)),
        field('role', scalarValue(attachment.role))
      ]
    })) }),
    field('body_blob_hash', scalarValue(bodyHash)),
    field('created_at', scalarValue(snapshot.created_at)),
    field('deleted_at', scalarValue(snapshot.deleted_at)),
    field('desired_retention', numberValue(snapshot.desired_retention)),
    field('enable_short_term', scalarValue(snapshot.enable_short_term)),
    field('hide_title_heading', scalarValue(snapshot.hide_title_heading)),
    field('id', scalarValue(snapshot.id)),
    field('image_regions', scalarValue(snapshot.image_regions)),
    field('image_sources', scalarValue(snapshot.image_sources)),
    field('import_content_fingerprint', scalarValue(snapshot.import_content_fingerprint)),
    field('import_source_fingerprint', scalarValue(snapshot.import_source_fingerprint)),
    field('is_title_manual', scalarValue(snapshot.is_title_manual)),
    field('kind', scalarValue(snapshot.kind)),
    field('manual_child_order', scalarValue(snapshot.manual_child_order)),
    field('opening_text', scalarValue(snapshot.opening_text)),
    field('parent_id', scalarValue(snapshot.parent_id)),
    field('position', numberValue(snapshot.position)),
    field('priority', numberValue(snapshot.priority)),
    field('resource_references', scalarValue(snapshot.resource_references)),
    field('reveal', scalarValue(snapshot.reveal)),
    field('sequential_reading_enabled', scalarValue(snapshot.sequential_reading_enabled)),
    field('shelved_at', scalarValue(snapshot.shelved_at)),
    field('title', scalarValue(snapshot.title)),
    field('updated_at', scalarValue(snapshot.updated_at)),
    field('virtual_filter', scalarValue(snapshot.virtual_filter))
  ] satisfies CanonicalField[];
}

export function projectDesktopFramedSyncNodeRecord(
  record: NativeSyncNodeRecord
): DesktopFramedSyncNodeProjection {
  if (!record.version_id || record.snapshot.id !== record.object_id ||
      !record.content_hash || !/^[a-f0-9]{64}$/u.test(record.content_hash)) {
    throw new Error('node_version_projection_identity_invalid');
  }
  const sourceBody = record.body_text ?? (record.is_tombstone ? '' : null);
  if (sourceBody === null) throw new Error('node_version_body_unavailable');
  const bodyBlob = encoder.encode(sourceBody);
  const bodyHash = sha256(bodyBlob);
  const blob: CanonicalBlob = {
    byteLength: BigInt(bodyBlob.byteLength), required: true, role: 1, sha256: bodyHash
  };
  const fact: CanonicalFact = {
    blobs: [blob],
    body: [
      field('ancestor_version_ids', stringList(record.ancestor_version_ids)),
      field('content_hash', scalarValue(record.content_hash)),
      field('host_name', scalarValue(record.host_name)),
      field('is_tombstone', scalarValue(record.is_tombstone ?? false)),
      field('parent_version_id', scalarValue(record.parent_version_id)),
      field('parent_version_ids', stringList(record.parent_version_ids ?? (
        record.parent_version_id ? [record.parent_version_id] : []
      ))),
      field('snapshot', { kind: 'object', value: snapshotFields(record.snapshot, bytesToHex(bodyHash)) }),
      field('updated_at', scalarValue(record.updated_at)),
      field('version_created_at', scalarValue(record.version_created_at))
    ],
    factId: record.version_id,
    globalId: record.object_id,
    kind: FRAMED_SYNC_NODE_VERSION_FACT.factKind,
    objectType: FRAMED_SYNC_NODE_VERSION_FACT.factObjectType,
    sharedStateHash: hexToBytes(record.content_hash)
  };
  assertNodeVersionFactShape(fact);
  return { bodyBlob, manifest: { blobs: [blob], facts: [fact] } };
}

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
      const item = fieldsByName(entry.value, ['attachment_id', 'role'], 'node_version_fact_attachments_invalid');
      return { attachment_id: readString(requiredValue(item, 'attachment_id'))!,
        role: readString(requiredValue(item, 'role'))! };
    }),
    body_blob_hash: readString(get('body_blob_hash')),
    created_at: readString(get('created_at'))!, deleted_at: readString(get('deleted_at'), true),
    desired_retention: readNumber(get('desired_retention')),
    enable_short_term: readBool(get('enable_short_term'), true),
    hide_title_heading: readBool(get('hide_title_heading'))!, id: readString(get('id'))!,
    image_regions: readString(get('image_regions'), true), image_sources: readString(get('image_sources'), true),
    import_content_fingerprint: readString(get('import_content_fingerprint'), true),
    import_source_fingerprint: readString(get('import_source_fingerprint'), true),
    is_title_manual: readBool(get('is_title_manual'))!, kind: readString(get('kind'))!,
    manual_child_order: readString(get('manual_child_order'), true), opening_text: readString(get('opening_text'), true),
    parent_id: readString(get('parent_id'), true), position: readNumber(get('position')),
    priority: readNumber(get('priority')), ...(resourceReferences === null ? {} : { resource_references: resourceReferences }),
    reveal: readString(get('reveal'), true), sequential_reading_enabled: readBool(get('sequential_reading_enabled'), true),
    shelved_at: readString(get('shelved_at'), true), title: readString(get('title'))!,
    updated_at: readString(get('updated_at'))!, virtual_filter: readString(get('virtual_filter'), true)
  };
}

function sameBlob(left: CanonicalBlob, right: CanonicalBlob) {
  return left.byteLength === right.byteLength && left.required === right.required && left.role === right.role &&
    left.sha256.length === right.sha256.length && left.sha256.every((byte, index) => right.sha256[index] === byte);
}

export function restoreDesktopFramedSyncNodeRecord(
  projection: DesktopFramedSyncNodeProjection
): NativeSyncNodeRecord {
  if (projection.manifest.facts.length !== 1 || projection.manifest.blobs.length !== 1) {
    throw new Error('node_version_projection_manifest_invalid');
  }
  const fact = projection.manifest.facts[0]!;
  const blob = projection.manifest.blobs[0]!;
  assertNodeVersionFactShape(fact);
  if (fact.blobs.length !== 1 || !sameBlob(fact.blobs[0]!, blob) ||
      blob.byteLength !== BigInt(projection.bodyBlob.byteLength) ||
      !sameBlob(blob, { ...blob, sha256: sha256(projection.bodyBlob) })) {
    throw new Error('node_version_projection_body_blob_invalid');
  }
  const values = fieldsByName(fact.body, FRAMED_SYNC_NODE_VERSION_FACT.bodyFields,
    'node_version_fact_body_shape_invalid');
  const get = (name: string) => requiredValue(values, name);
  const contentHash = readString(get('content_hash'))!;
  if (bytesToHex(fact.sharedStateHash) !== contentHash) throw new Error('node_version_shared_state_hash_mismatch');
  const snapshot = readSnapshot(get('snapshot'));
  if (snapshot.id !== fact.globalId || snapshot.body_blob_hash !== bytesToHex(blob.sha256)) {
    throw new Error('node_version_projection_identity_invalid');
  }
  return {
    ancestor_version_ids: readStringList(get('ancestor_version_ids')),
    body_text: decoder.decode(projection.bodyBlob), content_hash: contentHash,
    host_name: readString(get('host_name'), true), is_tombstone: readBool(get('is_tombstone'))!,
    object_id: fact.globalId, object_type: 'node', parent_version_id: readString(get('parent_version_id'), true),
    parent_version_ids: readStringList(get('parent_version_ids')), snapshot,
    updated_at: readString(get('updated_at'))!, version_created_at: readString(get('version_created_at'), true),
    version_id: fact.factId
  };
}
