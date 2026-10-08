import { sha256 as hashSha256 } from '@noble/hashes/sha2.js';

import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import { isBodyDescriptor } from './framedSyncBlobContract.js';
import { CanonicalWriter as Writer } from './framedSyncCanonicalWriter.js';
import {
  assertFramedSyncDigest,
  FRAMED_SYNC_LIMITS,
  type FramedSyncContext
} from './framedSyncContract.js';
import {
  assertCanonicalFactIdentity,
  assertManifestBlobGraph,
  assertUniqueCanonicalFacts
} from './framedSyncManifestGraph.js';

export type CanonicalValue =
  | Readonly<{ kind: 'bool'; value: boolean }>
  | Readonly<{ kind: 'bytes'; value: Uint8Array }>
  | Readonly<{ kind: 'list'; value: readonly CanonicalValue[] }>
  | Readonly<{ kind: 'null' }>
  | Readonly<{ kind: 'object'; value: readonly CanonicalField[] }>
  | Readonly<{ kind: 'signed'; value: bigint }>
  | Readonly<{ kind: 'string'; value: string }>
  | Readonly<{ kind: 'unsigned'; value: bigint }>;

export type CanonicalField = Readonly<{ name: string; value: CanonicalValue }>;

export type CanonicalBlob = Readonly<{
  byteLength: bigint;
  required: boolean;
  role: number;
  sha256: Uint8Array;
}>;

export type CanonicalFact = Readonly<{
  blobs: readonly CanonicalBlob[];
  body: readonly CanonicalField[];
  factId: string;
  globalId: string;
  kind: number;
  objectType: string;
  sharedStateHash: Uint8Array;
}>;

export type CanonicalManifest = Readonly<{
  blobs: readonly CanonicalBlob[];
  facts: readonly CanonicalFact[];
}>;

const CONTENT_DOMAIN = 'foliole-framed-sync-content-v1';
const TRANSFER_DOMAIN = 'foliole-framed-sync-transfer-v1';
const textEncoder = new TextEncoder();


function compareBytes(left: Uint8Array, right: Uint8Array) {
  const size = Math.min(left.byteLength, right.byteLength);
  for (let index = 0; index < size; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return left.byteLength - right.byteLength;
}

function compareText(left: string, right: string) {
  return compareBytes(textEncoder.encode(left), textEncoder.encode(right));
}


function sortedFields(fields: readonly CanonicalField[]) {
  const sorted = [...fields].sort((left, right) => compareText(left.name, right.name));
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1]!.name === sorted[index]!.name) throw new Error('canonical_field_duplicate');
  }
  return sorted;
}

function writeValue(writer: Writer, value: CanonicalValue, depth: number) {
  if (depth > FRAMED_SYNC_LIMITS.maxCanonicalDepth) throw new Error('canonical_depth_limit_exceeded');
  switch (value.kind) {
    case 'null': writer.byte(0); break;
    case 'bool': writer.byte(value.value ? 2 : 1); break;
    case 'signed': writer.byte(3); writer.i64(value.value); break;
    case 'unsigned': writer.byte(4); writer.u64(value.value); break;
    case 'string': writer.byte(5); writer.string(value.value); break;
    case 'bytes': writer.byte(6); writer.data(value.value); break;
    case 'list':
      writer.byte(7); writer.u32(value.value.length);
      for (const item of value.value) writeValue(writer, item, depth + 1);
      break;
    case 'object': writer.byte(8); writeObject(writer, value.value, depth + 1); break;
    default: {
      const exhaustive: never = value;
      throw new Error(`canonical_value_unsupported:${String(exhaustive)}`);
    }
  }
}

function writeObject(writer: Writer, fields: readonly CanonicalField[], depth = 0) {
  writer.countNodes(fields.length);
  const sorted = sortedFields(fields);
  writer.u32(sorted.length);
  for (const field of sorted) {
    writer.string(field.name);
    writeValue(writer, field.value, depth + 1);
  }
}

function compareFacts(left: CanonicalFact, right: CanonicalFact) {
  return left.kind - right.kind || compareText(left.objectType, right.objectType) ||
    compareText(left.globalId, right.globalId) || compareText(left.factId, right.factId);
}

function writeFact(writer: Writer, fact: CanonicalFact) {
  assertCanonicalFactIdentity(fact);
  writer.u32(fact.kind); writer.string(fact.objectType); writer.string(fact.globalId); writer.string(fact.factId);
  writer.data(assertFramedSyncDigest(fact.sharedStateHash, 'shared_state_hash')); writeObject(writer, fact.body);
  const blobs = sortedBlobs(fact.blobs);
  writer.u32(blobs.length);
  for (const blob of blobs) writeBlob(writer, blob);
}

function writeBlob(writer: Writer, blob: CanonicalBlob) {
  writer.data(assertFramedSyncDigest(blob.sha256, 'blob_hash'));
  writer.u64(blob.byteLength);
  writer.u32(blob.role);
  writer.byte(blob.required ? 1 : 0);
}

function sortedBlobs(blobs: readonly CanonicalBlob[]) {
  const sorted = [...blobs].sort((left, right) => compareBytes(left.sha256, right.sha256));
  let total = 0n;
  for (let index = 0; index < sorted.length; index += 1) {
    const blob = sorted[index]!;
    const limit = isBodyDescriptor(blob) ? TEXT_BODY_MAX_BYTES : FRAMED_SYNC_LIMITS.maxBlobBytes;
    if (blob.byteLength < 0n || blob.byteLength > BigInt(limit)) {
      throw new Error('canonical_blob_size_limit_exceeded');
    }
    total += blob.byteLength;
    if (total > BigInt(FRAMED_SYNC_LIMITS.maxTransferBytes)) throw new Error('canonical_transfer_size_limit_exceeded');
    if (index > 0 && compareBytes(sorted[index - 1]!.sha256, blob.sha256) === 0) {
      throw new Error('canonical_blob_duplicate');
    }
  }
  return sorted;
}

function writeCanonicalManifest(manifest: CanonicalManifest, writer: Writer) {
  if (manifest.facts.length > FRAMED_SYNC_LIMITS.maxFactsPerTransfer ||
      manifest.blobs.length > FRAMED_SYNC_LIMITS.maxBlobsPerTransfer) {
    throw new Error('canonical_manifest_item_limit_exceeded');
  }
  writer.string(CONTENT_DOMAIN);
  const facts = [...manifest.facts].sort(compareFacts);
  assertUniqueCanonicalFacts(facts);
  writer.u32(facts.length);
  for (const fact of facts) writeFact(writer, fact);
  const blobs = sortedBlobs(manifest.blobs);
  assertManifestBlobGraph(facts, blobs);
  writer.u32(blobs.length);
  for (const blob of blobs) writeBlob(writer, blob);
}

export function canonicalManifestBytes(manifest: CanonicalManifest) {
  const writer = new Writer();
  writeCanonicalManifest(manifest, writer);
  return writer.result();
}

async function sha256(value: Uint8Array) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(value)));
}

export async function canonicalContentId(manifest: CanonicalManifest) {
  const hash = hashSha256.create();
  try {
    writeCanonicalManifest(manifest, new Writer((bytes) => hash.update(bytes)));
    return hash.digest();
  } finally {
    hash.destroy();
  }
}

/** Descriptors are bounded metadata; the loader returns one fixed-source fact at a time. */
export async function canonicalContentIdFromSource<L>(entries: readonly {
  locator: L; descriptor: Omit<CanonicalFact, 'body'>;
}[], blobs: readonly CanonicalBlob[], load: (locator: L) => Promise<CanonicalFact>) {
  if (entries.length > FRAMED_SYNC_LIMITS.maxFactsPerTransfer || blobs.length > FRAMED_SYNC_LIMITS.maxBlobsPerTransfer) {
    throw new Error('canonical_manifest_item_limit_exceeded');
  }
  const sorted = [...entries].sort((left, right) => compareFacts(
    { ...left.descriptor, body: [] }, { ...right.descriptor, body: [] }));
  const descriptors = sorted.map((entry) => entry.descriptor);
  assertUniqueCanonicalFacts(descriptors);
  const manifestBlobs = sortedBlobs(blobs);
  assertManifestBlobGraph(descriptors, manifestBlobs);
  const hash = hashSha256.create();
  try {
    const writer = new Writer((bytes) => hash.update(bytes));
    writer.string(CONTENT_DOMAIN); writer.u32(sorted.length);
    for (const entry of sorted) {
      const fact = await load(entry.locator);
      const descriptor = entry.descriptor;
      if (compareFacts({ ...descriptor, body: [] }, fact) !== 0 ||
          compareBytes(descriptor.sharedStateHash, fact.sharedStateHash) !== 0 ||
          !sameBlobDescriptors(descriptor.blobs, fact.blobs)) throw new Error('canonical_fact_source_changed');
      writeFact(writer, fact);
    }
    writer.u32(manifestBlobs.length);
    for (const blob of manifestBlobs) writeBlob(writer, blob);
    return hash.digest();
  } finally { hash.destroy(); }
}

function sameBlobDescriptors(left: readonly CanonicalBlob[], right: readonly CanonicalBlob[]) {
  const a = sortedBlobs(left), b = sortedBlobs(right);
  return a.length === b.length && a.every((blob, index) => {
    const other = b[index]!;
    return compareBytes(blob.sha256, other.sha256) === 0 && blob.byteLength === other.byteLength &&
      blob.required === other.required && blob.role === other.role;
  });
}

export async function canonicalTransferId(context: FramedSyncContext, contentId: Uint8Array) {
  const writer = new Writer();
  writer.string(TRANSFER_DOMAIN); writer.u32(context.protocolVersion); writer.string(context.groupId);
  writer.string(context.senderDeviceId); writer.string(context.senderLibraryEpoch);
  writer.string(context.receiverDeviceId); writer.string(context.receiverLibraryEpoch);
  writer.data(assertFramedSyncDigest(contentId, 'content_id'));
  return sha256(writer.result());
}
