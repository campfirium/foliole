import type {
  CanonicalFact,
  CanonicalField,
  CanonicalValue
} from './framedSyncCanonicalManifest.js';
import { readFramedSyncNodeResources } from './framedSyncNodeResources.js';

export const FRAMED_SYNC_NODE_VERSION_FACT = Object.freeze({
  bodyFields: [
    'ancestor_version_ids', 'content_hash', 'host_name', 'is_tombstone',
    'parent_version_id', 'parent_version_ids', 'snapshot', 'updated_at',
    'version_created_at'
  ],
  bodyTextTransport: 'required BLOB_ROLE_NODE_BODY addressed by snapshot.body_blob_hash',
  factKind: 2,
  factObjectType: 'node',
  globalIdSource: 'NativeSyncNodeRecord.object_id',
  snapshotFields: [
    'anchor_link', 'anchor_resolution_status', 'anchor_source_version_id', 'attachments',
    'body_blob_hash', 'created_at', 'deleted_at', 'desired_retention', 'enable_short_term',
    'hide_title_heading', 'id', 'image_regions', 'image_sources',
    'import_content_fingerprint', 'import_source_fingerprint', 'is_title_manual', 'kind',
    'manual_child_order', 'opening_text', 'parent_id', 'position', 'priority',
    'resource_references', 'reveal', 'sequential_reading_enabled', 'shelved_at', 'title',
    'updated_at', 'virtual_filter'
  ],
  versionIdSource: 'NativeSyncNodeRecord.version_id'
} as const);

function exactFields(fields: readonly CanonicalField[], expected: readonly string[], error: string) {
  const values = new Map(fields.map((field) => [field.name, field.value]));
  if (values.size !== fields.length || values.size !== expected.length ||
      expected.some((name) => !values.has(name))) throw new Error(error);
  return values;
}

function required(fields: ReadonlyMap<string, CanonicalValue>, name: string) {
  const value = fields.get(name);
  if (!value) throw new Error('node_version_fact_field_missing');
  return value;
}

function stringValue(value: CanonicalValue, nullable = false) {
  if (nullable && value.kind === 'null') return null;
  if (value.kind !== 'string') throw new Error('node_version_fact_string_invalid');
  return value.value;
}

function boolValue(value: CanonicalValue, nullable = false) {
  if (nullable && value.kind === 'null') return;
  if (value.kind !== 'bool') throw new Error('node_version_fact_bool_invalid');
}

function numberValue(value: CanonicalValue) {
  if (value.kind === 'null') return;
  if (value.kind !== 'signed' || value.value < BigInt(Number.MIN_SAFE_INTEGER) ||
      value.value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('node_version_fact_number_invalid');
  }
}

function stringList(value: CanonicalValue) {
  if (value.kind !== 'list' || value.value.some((item) => item.kind !== 'string')) {
    throw new Error('node_version_fact_string_list_invalid');
  }
}

function attachments(value: CanonicalValue) {
  if (value.kind !== 'list') throw new Error('node_version_fact_attachments_invalid');
  for (const attachment of value.value) {
    if (attachment.kind !== 'object') throw new Error('node_version_fact_attachments_invalid');
    const fields = exactFields(
      attachment.value, ['attachment_id', 'role'], 'node_version_fact_attachments_invalid'
    );
    stringValue(required(fields, 'attachment_id'));
    stringValue(required(fields, 'role'));
  }
}

function hex(value: Uint8Array) {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertSnapshot(value: CanonicalValue, globalId: string, bodyHash: string) {
  if (value.kind !== 'object') throw new Error('node_version_fact_snapshot_invalid');
  const fields = exactFields(
    value.value,
    FRAMED_SYNC_NODE_VERSION_FACT.snapshotFields,
    'node_version_fact_snapshot_shape_invalid'
  );
  const get = (name: string) => required(fields, name);
  for (const name of [
    'anchor_link', 'anchor_source_version_id', 'deleted_at', 'image_regions', 'image_sources',
    'import_content_fingerprint', 'import_source_fingerprint', 'manual_child_order',
    'opening_text', 'parent_id', 'resource_references', 'reveal', 'shelved_at', 'virtual_filter'
  ]) stringValue(get(name), true);
  for (const name of ['created_at', 'kind', 'title', 'updated_at']) stringValue(get(name));
  for (const name of ['hide_title_heading', 'is_title_manual']) boolValue(get(name));
  for (const name of ['enable_short_term', 'sequential_reading_enabled']) boolValue(get(name), true);
  for (const name of ['desired_retention', 'position', 'priority']) numberValue(get(name));
  attachments(get('attachments'));
  const resolution = stringValue(get('anchor_resolution_status'), true);
  if (resolution !== null && resolution !== 'resolved' &&
      resolution !== 'unmapped_ambiguous' && resolution !== 'unmapped_missing') {
    throw new Error('node_version_fact_anchor_resolution_invalid');
  }
  if (stringValue(get('id')) !== globalId) throw new Error('node_version_fact_snapshot_identity_invalid');
  const snapshotBodyHash = stringValue(get('body_blob_hash'));
  if (snapshotBodyHash === null || !/^[a-f0-9]{64}$/u.test(snapshotBodyHash) ||
      snapshotBodyHash !== bodyHash) {
    throw new Error('node_version_fact_body_blob_hash_mismatch');
  }
  return stringValue(get('resource_references'), true);
}

export function assertNodeVersionFactShape(fact: CanonicalFact) {
  if (fact.kind !== FRAMED_SYNC_NODE_VERSION_FACT.factKind ||
      fact.objectType !== FRAMED_SYNC_NODE_VERSION_FACT.factObjectType ||
      !fact.globalId || !fact.factId) throw new Error('node_version_fact_identity_invalid');
  const bodyBlobs = fact.blobs.filter((blob) => blob.role === 1);
  if (bodyBlobs.length !== 1 || fact.blobs.some((blob) => !blob.required)) {
    throw new Error('node_version_fact_body_blob_invalid');
  }
  const fields = exactFields(
    fact.body, FRAMED_SYNC_NODE_VERSION_FACT.bodyFields, 'node_version_fact_body_shape_invalid'
  );
  const get = (name: string) => required(fields, name);
  stringList(get('ancestor_version_ids'));
  stringList(get('parent_version_ids'));
  for (const name of ['host_name', 'parent_version_id', 'version_created_at']) {
    stringValue(get(name), true);
  }
  stringValue(get('updated_at'));
  boolValue(get('is_tombstone'));
  const contentHash = stringValue(get('content_hash'));
  if (contentHash === null || !/^[a-f0-9]{64}$/u.test(contentHash) ||
      contentHash !== hex(fact.sharedStateHash)) {
    throw new Error('node_version_fact_shared_state_hash_mismatch');
  }
  const references = readFramedSyncNodeResources(
    assertSnapshot(get('snapshot'), fact.globalId, hex(bodyBlobs[0]!.sha256))
  );
  const resources = fact.blobs.filter((blob) => blob.role !== 1);
  if (resources.length !== references.length || references.some((reference) =>
    !resources.some((blob) => hex(blob.sha256) === reference.contentHash &&
      blob.role === reference.role))) {
    throw new Error('node_version_fact_resource_blobs_invalid');
  }
}
