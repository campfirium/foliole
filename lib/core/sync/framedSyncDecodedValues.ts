import { bytesToHex } from '@noble/hashes/utils.js';

import { TEXT_BODY_MAX_BYTES, utf8ByteLength } from '../nodes/textBodyBudget.js';

import { isBodyDescriptor } from './framedSyncBlobContract.js';
import {
  assertFramedSyncDigest,
  FRAMED_SYNC_LIMITS,
  FRAMED_SYNC_PROTOCOL_VERSION
} from './framedSyncContract.js';

type Row = Record<string, unknown>;
type Budget = { fields: number };
// One canonical object level expands into four decoded protobuf containers. The extra
// envelope allows canonical validation to own both the exact limit and its +1 case.
const MAX_PROTOBUF_CONTAINER_DEPTH = FRAMED_SYNC_LIMITS.maxCanonicalDepth * 4 + 8;

export function row(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value)) {
    throw new Error('protocol_object_required');
  }
  return value as Row;
}

export function list(value: unknown, limit: number = FRAMED_SYNC_LIMITS.maxDecodedRepeatedItems) {
  if (!Array.isArray(value) || value.length > limit) throw new Error('protocol_repeated_limit_exceeded');
  return value;
}

export function bytes(value: unknown, name: string) {
  if (!ArrayBuffer.isView(value) ||
      (value as ArrayBufferView & { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT !== 1) {
    throw new Error(`${name}_bytes_required`);
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

export function digest(value: unknown, name: string) {
  return assertFramedSyncDigest(bytes(value, name), name);
}

export function fixedBytes(value: unknown, size: number, name: string) {
  if (bytes(value, name).byteLength !== size) throw new Error(`${name}_length_invalid`);
}

export function hex(value: Uint8Array) {
  return bytesToHex(value);
}

export function protocolString(value: unknown) {
  return boundedString(value, FRAMED_SYNC_LIMITS.maxProtocolStringBytes, 'protocol_string_limit_exceeded');
}

function boundedString(value: unknown, limit: number, error: string) {
  if (typeof value !== 'string') throw new Error('protocol_string_required');
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) throw new Error('protocol_unicode_invalid');
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new Error('protocol_unicode_invalid');
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error('protocol_unicode_invalid');
  }
  if (utf8ByteLength(value) > limit) {
    throw new Error(error);
  }
  return value;
}

export function text(value: unknown, name: string) {
  if (typeof value !== 'string') throw new Error(`${name}_required`);
  if (!value) throw new Error('protocol_string_required');
  return protocolString(value);
}

export function unsigned(value: unknown, name: string) {
  let result: bigint;
  try { result = BigInt(String(value)); } catch { throw new Error(`${name}_invalid`); }
  if (result < 0n || result > 0xffff_ffff_ffff_ffffn) throw new Error(`${name}_invalid`);
  return result;
}

export function enumValue(value: unknown, max: number, name: string) {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > max) {
    throw new Error(`${name}_invalid`);
  }
}

export function walk(value: unknown, depth: number, budget: Budget): void {
  if (depth > MAX_PROTOBUF_CONTAINER_DEPTH) throw new Error('protocol_depth_limit_exceeded');
  if (typeof value === 'string') { protocolString(value); return; }
  if (ArrayBuffer.isView(value)) {
    if (value.byteLength > FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes) {
      throw new Error('protocol_bytes_limit_exceeded');
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    list(value);
    for (const item of value) walk(item, depth + 1, budget);
    return;
  }
  const object = value as Row;
  for (const key in object) if (Object.hasOwn(object, key)) budget.fields += 1;
  if (budget.fields > FRAMED_SYNC_LIMITS.maxDecodedFields) throw new Error('protocol_field_limit_exceeded');
  for (const key in object) {
    if (!Object.hasOwn(object, key)) continue;
    const item = object[key];
    if (key === 'stringValue') {
      boundedString(item, FRAMED_SYNC_LIMITS.maxCanonicalStringBytes, 'canonical_string_limit_exceeded');
    } else walk(item, depth + 1, budget);
  }
}

export function unique(values: readonly string[], name: string) {
  if (new Set(values).size !== values.length) throw new Error(`${name}_duplicate`);
}

export function factIdentity(value: unknown) {
  const identity = row(value);
  enumValue(identity.kind, 8, 'fact_kind');
  const parts = ['objectType', 'globalId', 'factId'].map((key) => text(identity[key], key));
  return parts.join('\0');
}

export function blobReference(value: unknown) {
  const blob = row(value);
  const hash = digest(blob.sha256, 'blob_hash');
  enumValue(blob.role, 5, 'blob_role');
  const limit = isBodyDescriptor({ role: Number(blob.role) }) ? TEXT_BODY_MAX_BYTES : FRAMED_SYNC_LIMITS.maxBlobBytes;
  if (unsigned(blob.byteLength, 'blob_byte_length') > BigInt(limit)) {
    throw new Error('blob_byte_length_limit_exceeded');
  }
  return hex(hash);
}

function canonicalValue(value: unknown, depth: number): void {
  if (depth > FRAMED_SYNC_LIMITS.maxCanonicalDepth) throw new Error('canonical_depth_limit_exceeded');
  const item = row(value);
  const cases = ['boolValue', 'signedValue', 'unsignedValue', 'stringValue', 'bytesValue',
    'listValue', 'objectValue', 'nullValue'].filter((key) => item[key] !== undefined && item[key] !== null);
  if (cases.length !== 1) throw new Error('canonical_value_case_invalid');
  const selected = cases[0]!;
  if (selected === 'nullValue' && item.nullValue !== true) throw new Error('canonical_null_invalid');
  if (selected === 'listValue') {
    for (const child of list(row(item.listValue).values)) canonicalValue(child, depth + 1);
  }
  if (selected === 'objectValue') canonicalObject(item.objectValue, depth + 1);
}

function canonicalObject(value: unknown, depth = 0) {
  const fields = list(row(value).fields);
  const names = fields.map((field) => text(row(field).name, 'canonical_field_name'));
  unique(names, 'canonical_field');
  for (const field of fields) canonicalValue(row(field).value, depth + 1);
}

export function factRecord(value: unknown) {
  const fact = row(value);
  factIdentity(fact.identity); digest(fact.sharedStateHash, 'shared_state_hash');
  canonicalObject(fact.body);
  unique(list(fact.blobs, FRAMED_SYNC_LIMITS.maxBlobsPerTransfer).map(blobReference), 'fact_blob');
}

export function transferManifest(value: unknown) {
  const manifest = row(value);
  if (manifest.protocolVersion !== FRAMED_SYNC_PROTOCOL_VERSION) throw new Error('protocol_version_invalid');
  text(manifest.groupId, 'group_id'); digest(manifest.contentId, 'content_id');
  const facts = list(manifest.facts, FRAMED_SYNC_LIMITS.maxFactsPerTransfer);
  unique(facts.map((fact) => {
    const descriptor = row(fact); digest(descriptor.sharedStateHash, 'shared_state_hash');
    const hashes = list(descriptor.requiredBlobHashes, FRAMED_SYNC_LIMITS.maxFactBlobEdges)
      .map((hash) => hex(digest(hash, 'blob_hash')));
    unique(hashes, 'required_blob_hash');
    return factIdentity(descriptor.identity);
  }), 'manifest_fact');
  const declaredBlobs = list(manifest.blobs, FRAMED_SYNC_LIMITS.maxBlobsPerTransfer)
    .map(blobReference);
  unique(declaredBlobs, 'manifest_blob');
  const declared = new Set(declaredBlobs);
  for (const fact of facts) {
    for (const hash of list(row(fact).requiredBlobHashes, FRAMED_SYNC_LIMITS.maxFactBlobEdges)) {
      if (!declared.has(hex(digest(hash, 'blob_hash')))) throw new Error('required_blob_undeclared');
    }
  }
}

export function capabilities(value: unknown) {
  const items = list(value, FRAMED_SYNC_LIMITS.maxProtocolCapabilities);
  unique(items.map((item) => {
    const capability = row(item);
    if (unsigned(capability.version, 'capability_version') === 0n) {
      throw new Error('capability_version_invalid');
    }
    return text(capability.name, 'capability_name');
  }), 'capability');
}

export function validateIdentityList(value: unknown) {
  const facts = list(value, FRAMED_SYNC_LIMITS.maxFactsPerTransfer);
  unique(facts.map(factIdentity), 'fact_identity');
}
