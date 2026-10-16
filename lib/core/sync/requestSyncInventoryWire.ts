import { sha256 } from '@noble/hashes/sha2.js';

import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { bytes, list, row, unsigned } from './framedSyncDecodedValues.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { entriesFromWire, entryToWire } from './framedSyncInventoryWire.js';
import { decodedInventoryEncoding, encodeValidatedProtocolMessage, type ValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { completeRequestSyncInventoryEntry, mergeRequestSyncInventoryPart, requestSyncInventoryParts } from './requestSyncInventoryParts.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';

export function* iterateRequestSyncInventory(input: {
  entries: readonly FramedSyncInventoryEntry[];
  roundId: Uint8Array;
  detailGlobalIds?: readonly string[];
  summaryOnly?: boolean;
  bucketSummary?: boolean;
  bucketHashes?: Uint8Array;
  unreadyBuckets?: readonly number[];
  selectedBuckets?: readonly number[];
}): Generator<RequestSyncMessage> {
  yield { payloadCase: 'inventory_begin', payload: { entryCount: input.entries.length, roundId: input.roundId,
    detailGlobalIds: input.detailGlobalIds ?? [], summaryOnly: input.summaryOnly ?? false,
    bucketSummary: input.bucketSummary ?? false, bucketHashes: input.bucketHashes ?? new Uint8Array(),
    unreadyBuckets: input.unreadyBuckets ?? [], selectedBuckets: input.selectedBuckets ?? [] } };
  const hash = sha256.create();
  if (input.bucketHashes?.length) hash.update(input.bucketHashes);
  let chunkIndex = 0;
  for (const part of packedInventoryChunks(input.entries)) {
    const payload = { ...part, chunkIndex: chunkIndex++, roundId: input.roundId };
    const encoded = encodeValidatedProtocolMessage('inventory_chunk', payload);
    if (encoded.length > FRAMED_SYNC_LIMITS.maxControlMessageBytes) throw new Error('inventory_frame_limit_exceeded');
    hash.update(new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength));
    yield { payloadCase: 'inventory_chunk', payload };
  }
  yield { payloadCase: 'inventory_end', payload: { inventoryHash: hash.digest(), roundId: input.roundId } };
}

export async function decodeRequestSyncInventory(messages: AsyncIterable<ValidatedProtocolMessage>,
  options: { retainEntries?: boolean } = {}) {
  const entries: FramedSyncInventoryEntry[] = [];
  const hash = sha256.create();
  const identities = new Set<string>();
  let begin: { roundId: Uint8Array; expected: bigint; detailGlobalIds: string[]; summaryOnly: boolean; bucketSummary: boolean; bucketHashes: Uint8Array;
    unreadyBuckets: number[]; selectedBuckets: number[] } | undefined;
  let part: FramedSyncInventoryEntry | undefined;
  let partIndex = 0;
  let chunkIndex = 0;
  let ended = false;
  for await (const message of messages) {
    const payload = row(message.payload);
    if (ended) throw new Error('inventory_exchange_incomplete');
    if (!begin) {
      if (message.payloadCase !== 'inventory_begin') throw new Error('inventory_exchange_incomplete');
      begin = { roundId: bytes(payload.roundId, 'round_id'), expected: unsigned(payload.entryCount, 'entry_count'),
        detailGlobalIds: list(payload.detailGlobalIds ?? []).map(String), summaryOnly: payload.summaryOnly === true,
        bucketSummary: payload.bucketSummary === true, bucketHashes: bytes(payload.bucketHashes, 'bucket_hashes'),
        unreadyBuckets: list(payload.unreadyBuckets).map(Number), selectedBuckets: list(payload.selectedBuckets).map(Number) };
      if (begin.bucketHashes.length) hash.update(begin.bucketHashes);
      continue;
    }
    if (!equal(bytes(payload.roundId, 'round_id'), begin.roundId)) throw new Error('inventory_round_identity_mismatch');
    if (message.payloadCase === 'inventory_end') {
      if (part || BigInt(identities.size) !== begin.expected || !equal(bytes(payload.inventoryHash, 'inventory_hash'), hash.digest())) {
        throw new Error('inventory_exchange_incomplete');
      }
      ended = true;
      continue;
    }
    if (message.payloadCase !== 'inventory_chunk' || unsigned(payload.chunkIndex, 'chunk_index') !== BigInt(chunkIndex++) ||
        unsigned(payload.entryPartIndex ?? 0, 'entry_part_index') !== BigInt(partIndex++)) throw new Error('inventory_chunk_sequence_invalid');
    const incoming = entriesFromWire(payload);
    if (!incoming.length || (incoming.length > 1 && (part || payload.entryContinues === true))) {
      throw new Error('inventory_entry_part_shape_invalid');
    }
    hash.update(decodedInventoryEncoding(message));
    for (const value of incoming) {
      const next = { ...value, stateFactIds: [...value.stateFactIds ?? []], versionStates: [...value.versionStates ?? []] };
      if (part) mergeRequestSyncInventoryPart(part, next);
      else part = next;
      if (payload.entryContinues === true) continue;
      const key = `${part.objectType}\0${part.globalId}`;
      if (identities.has(key)) throw new Error('inventory_entry_part_duplicate');
      identities.add(key);
      if (BigInt(identities.size) > begin.expected) throw new Error('inventory_entry_limit_exceeded');
      completeRequestSyncInventoryEntry(part);
      if (options.retainEntries !== false) entries.push(part);
      part = undefined; partIndex = 0;
    }
  }
  if (!begin || !ended) throw new Error('inventory_exchange_incomplete');
  return { entries, ...begin };
}

function equal(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((value, index) => right[index] === value);
}

function* packedInventoryChunks(entries: readonly FramedSyncInventoryEntry[]) {
  let pending: ReturnType<typeof entryToWire>[] = [];
  let size = 0;
  for (const entry of entries) {
    const parts = requestSyncInventoryParts(entry);
    let current = parts.next();
    let entryPartIndex = 0;
    while (!current.done) {
      const next = parts.next();
      const wire = entryToWire(current.value);
      const payload = { entries: [wire], chunkIndex: 0, roundId: new Uint8Array(16),
        entryPartIndex, entryContinues: !next.done };
      const bytes = encodeValidatedProtocolMessage('inventory_chunk', payload).length + 16;
      const split = entryPartIndex > 0 || !next.done;
      if (pending.length && (split || pending.length >= FRAMED_SYNC_LIMITS.maxInventoryEntriesPerFrame ||
          size + bytes > FRAMED_SYNC_LIMITS.maxControlMessageBytes)) {
        yield { entries: pending, entryPartIndex: 0, entryContinues: false };
        pending = []; size = 0;
      }
      if (split) yield payload;
      else { pending.push(wire); size += bytes; }
      current = next;
      entryPartIndex += 1;
    }
  }
  if (pending.length) yield { entries: pending, entryPartIndex: 0, entryContinues: false };
}
