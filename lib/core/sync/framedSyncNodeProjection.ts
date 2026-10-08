import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import {
  type CanonicalBlob,
  type CanonicalFact,
  type CanonicalField,
  type CanonicalManifest,
  type CanonicalValue
} from './framedSyncCanonicalManifest.js';
import {
  assertNodeVersionFactShape,
  framedSyncMainBodyBlob,
  FRAMED_SYNC_NODE_VERSION_FACT
} from './framedSyncNodeFactContract.js';
import { restoreFramedSyncNodeRecord } from './framedSyncNodeRestore.js';
import type { FramedSyncNodeMetadata } from './framedSyncNodeRestore.js';
import { isNodeVersionIdentityOnly } from './syncNodeVersionHistory.js';
import { projectTopicTextBodyBlobs } from './topicTextFramedBodies.js';

export type FramedSyncNodeProjection = Readonly<{
  bodyBlob: Uint8Array;
  alternativeBodyBlobs?: ReadonlyArray<{ blob: CanonicalBlob; data: Uint8Array }>;
  manifest: CanonicalManifest;
}>;

const encoder = new TextEncoder();

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

function snapshotFields(snapshot: NativeSyncNodeRecord['snapshot'], bodyHash: string | null) {
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
    field('text_alternatives', scalarValue(snapshot.text_alternatives ? JSON.stringify(snapshot.text_alternatives) : null)),
    field('text_selection', scalarValue(snapshot.text_selection ? JSON.stringify(snapshot.text_selection) : null)),
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

export function projectFramedSyncNodeRecord(
  record: NativeSyncNodeRecord,
  resourceBlobs: readonly CanonicalBlob[] = []
): FramedSyncNodeProjection {
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
  const alternativeBodyBlobs = projectTopicTextBodyBlobs(record);
  const fact = projectNodeFact(record, bytesToHex(bodyHash), [blob, ...alternativeBodyBlobs.map((value) => value.blob), ...resourceBlobs]);
  return { bodyBlob, alternativeBodyBlobs, manifest: { blobs: fact.blobs, facts: [fact] } };
}

function projectNodeFact(record: FramedSyncNodeMetadata, bodyHash: string | null,
  blobs: readonly CanonicalBlob[], retired = false): CanonicalFact {
  if (!record.version_id || !record.content_hash || record.snapshot.id !== record.object_id ||
      !/^[a-f0-9]{64}$/u.test(record.content_hash)) throw new Error('node_version_projection_identity_invalid');
  const fact: CanonicalFact = {
    blobs,
    body: [
      field('ancestor_version_ids', stringList(record.ancestor_version_ids)),
      field('content_hash', scalarValue(record.content_hash)),
      field('host_name', scalarValue(record.host_name)),
      field('is_tombstone', scalarValue(record.is_tombstone ?? false)),
      field('parent_version_id', scalarValue(record.parent_version_id)),
      field('parent_version_ids', stringList(record.parent_version_ids ?? (
        record.parent_version_id ? [record.parent_version_id] : []
      ))),
      field('snapshot', { kind: 'object', value: snapshotFields(record.snapshot, bodyHash) }),
      field('updated_at', scalarValue(record.updated_at)),
      field('version_created_at', scalarValue(record.version_created_at))
    ],
    factId: record.version_id,
    globalId: record.object_id,
    kind: FRAMED_SYNC_NODE_VERSION_FACT.factKind,
    objectType: FRAMED_SYNC_NODE_VERSION_FACT.factObjectType,
    sharedStateHash: hexToBytes(record.content_hash)
  };
  const result = retired ? { ...fact, body: [...fact.body,
    field('body_retired', { kind: 'bool', value: true })] } : fact;
  assertNodeVersionFactShape(result);
  return result;
}

export function projectFramedSyncNodeIdentityFact(record: NativeSyncNodeRecord) {
  if (!isNodeVersionIdentityOnly(record)) throw new Error('node_version_identity_only_required');
  return projectNodeFact(record, record.snapshot.body_blob_hash ?? null, [], true);
}

export function restoreFramedSyncProjectedNodeRecord(
  projection: FramedSyncNodeProjection
): NativeSyncNodeRecord {
  if (projection.manifest.facts.length !== 1) {
    throw new Error('node_version_projection_manifest_invalid');
  }
  const fact = projection.manifest.facts[0];
  const manifestBlob = fact && framedSyncMainBodyBlob(fact);
  if (!fact || !manifestBlob) throw new Error('node_version_projection_manifest_invalid');
  return restoreFramedSyncNodeRecord({
    bodyBlob: projection.bodyBlob,
    fact,
    manifestBlob,
    alternativeBodies: (projection.alternativeBodyBlobs ?? []).map((value) => ({
      hash: bytesToHex(value.blob.sha256), text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(value.data)
    }))
  });
}
