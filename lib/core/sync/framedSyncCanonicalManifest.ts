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

class Writer {
  private readonly chunks: Uint8Array[] = [];
  private nodeCount = 0;
  private size = 0;

  byte(value: number) { this.append(Uint8Array.of(value)); }

  data(value: Uint8Array) {
    this.u32(value.byteLength);
    this.append(value);
  }

  string(value: string) {
    assertUnicodeScalars(value);
    const bytes = textEncoder.encode(value);
    if (bytes.byteLength > FRAMED_SYNC_LIMITS.maxCanonicalStringBytes) {
      throw new Error('canonical_string_limit_exceeded');
    }
    this.data(bytes);
  }

  u32(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
      throw new Error('canonical_u32_invalid');
    }
    this.append(Uint8Array.of(
      (value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff
    ));
  }

  u64(value: bigint) {
    if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new Error('canonical_u64_invalid');
    for (let shift = 56n; shift >= 0n; shift -= 8n) this.byte(Number((value >> shift) & 0xffn));
  }

  i64(value: bigint) {
    if (value < -0x8000_0000_0000_0000n || value > 0x7fff_ffff_ffff_ffffn) {
      throw new Error('canonical_i64_invalid');
    }
    this.u64(BigInt.asUintN(64, value));
  }

  countNodes(count: number) {
    this.nodeCount += count;
    if (this.nodeCount > FRAMED_SYNC_LIMITS.maxCanonicalFields) {
      throw new Error('canonical_node_limit_exceeded');
    }
  }

  result() {
    const result = new Uint8Array(this.size);
    let offset = 0;
    for (const chunk of this.chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  }

  private append(value: Uint8Array) {
    if (this.size + value.byteLength > FRAMED_SYNC_LIMITS.maxManifestBytes) {
      throw new Error('canonical_manifest_limit_exceeded');
    }
    this.chunks.push(value);
    this.size += value.byteLength;
  }
}

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

function assertUnicodeScalars(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) throw new Error('canonical_unicode_invalid');
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new Error('canonical_unicode_invalid');
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error('canonical_unicode_invalid');
  }
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
    if (blob.byteLength < 0n || blob.byteLength > BigInt(FRAMED_SYNC_LIMITS.maxBlobBytes)) {
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

export function canonicalManifestBytes(manifest: CanonicalManifest) {
  if (manifest.facts.length > FRAMED_SYNC_LIMITS.maxFactsPerTransfer ||
      manifest.blobs.length > FRAMED_SYNC_LIMITS.maxBlobsPerTransfer) {
    throw new Error('canonical_manifest_item_limit_exceeded');
  }
  const writer = new Writer();
  writer.string(CONTENT_DOMAIN);
  const facts = [...manifest.facts].sort(compareFacts);
  assertUniqueCanonicalFacts(facts);
  writer.u32(facts.length);
  for (const fact of facts) {
    assertCanonicalFactIdentity(fact);
    writer.u32(fact.kind); writer.string(fact.objectType); writer.string(fact.globalId); writer.string(fact.factId);
    writer.data(assertFramedSyncDigest(fact.sharedStateHash, 'shared_state_hash')); writeObject(writer, fact.body);
    const factBlobs = sortedBlobs(fact.blobs); writer.u32(factBlobs.length);
    for (const blob of factBlobs) writeBlob(writer, blob);
  }
  const blobs = sortedBlobs(manifest.blobs);
  assertManifestBlobGraph(facts, blobs);
  writer.u32(blobs.length);
  for (const blob of blobs) writeBlob(writer, blob);
  return writer.result();
}

async function sha256(value: Uint8Array) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(value)));
}

export function canonicalContentId(manifest: CanonicalManifest) {
  return sha256(canonicalManifestBytes(manifest));
}

export async function canonicalTransferId(context: FramedSyncContext, contentId: Uint8Array) {
  const writer = new Writer();
  writer.string(TRANSFER_DOMAIN); writer.u32(context.protocolVersion); writer.string(context.groupId);
  writer.string(context.senderDeviceId); writer.string(context.senderLibraryEpoch);
  writer.string(context.receiverDeviceId); writer.string(context.receiverLibraryEpoch);
  writer.data(assertFramedSyncDigest(contentId, 'content_id'));
  return sha256(writer.result());
}
