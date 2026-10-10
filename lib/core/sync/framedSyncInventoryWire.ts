import { sha256 } from '@noble/hashes/sha2.js';

import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { bytes, list, row, text, unsigned } from './framedSyncDecodedValues.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import {
  createFramedSyncProtocolEncoder,
  encodeValidatedProtocolMessage,
  type ValidatedProtocolMessage
} from './framedSyncProtocolCodec.js';
import type { ProtocolPayloadCase } from './framedSyncReceiver.js';

type InventorySessionMessage = Readonly<{
  payload: unknown;
  payloadCase: Extract<ProtocolPayloadCase, 'inventory_begin' | 'inventory_chunk' | 'inventory_end'>;
}>;

const CHUNK_SIZE = FRAMED_SYNC_LIMITS.maxInventoryEntriesPerFrame;

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}

function budget() {
  let total = 0;
  let frames = 2;
  const hash = sha256.create();
  return {
    add(encoded: Uint8Array) {
      total += encoded.byteLength + 32;
      frames += 1;
      if (total > FRAMED_SYNC_LIMITS.maxSessionBytes || frames > FRAMED_SYNC_LIMITS.maxSessionFrames) {
        throw new Error('inventory_session_limit_exceeded');
      }
      hash.update(new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength));
    },
    finish: () => hash.digest()
  };
}

function chunk(entries: readonly FramedSyncInventoryEntry[], roundId: Uint8Array, chunkIndex: number) {
  return { chunkIndex, entries: entries.map(entryToWire), roundId };
}

function encodedChunk(payload: ReturnType<typeof chunk>) {
  const encoded = encodeValidatedProtocolMessage('inventory_chunk', payload);
  if (encoded.byteLength > FRAMED_SYNC_LIMITS.maxControlMessageBytes) {
    throw new Error('inventory_frame_limit_exceeded');
  }
  return encoded;
}

function entryToWire(entry: FramedSyncInventoryEntry) {
  return {
    frontierFactIds: entry.frontierFactIds, globalId: entry.globalId,
    objectType: entry.objectType, requiredRelationIds: entry.requiredRelationIds,
    resourceHashes: entry.resourceHashes, reviewFactIds: entry.reviewFactIds,
    sharedStateHash: entry.sharedStateHash, stateFactIds: entry.stateFactIds ?? [],
    versionStates: entry.versionStates ?? [], currentVersionId: entry.currentVersionId ?? '', unready: entry.unready ?? false
  };
}

function entriesFromWire(value: unknown): readonly FramedSyncInventoryEntry[] {
  return list(row(value).entries).map((item) => {
    const entry = row(item);
    const strings = (key: string) => list(entry[key]).map((part) => text(part, key));
    const stateFactIds = strings('stateFactIds');
    return {
      frontierFactIds: strings('frontierFactIds'),
      globalId: text(entry.globalId, 'global_id'),
      objectType: text(entry.objectType, 'object_type'),
      requiredRelationIds: strings('requiredRelationIds'),
      resourceHashes: list(entry.resourceHashes).map((hash) => bytes(hash, 'resource_hash').slice()),
      reviewFactIds: strings('reviewFactIds'),
      sharedStateHash: bytes(entry.sharedStateHash, 'shared_state_hash').slice(),
      ...(entry.currentVersionId || entry.unready || (Array.isArray(entry.versionStates) && entry.versionStates.length) ? {
        currentVersionId: String(entry.currentVersionId ?? ''), unready: entry.unready === true,
        versionStates: list(entry.versionStates).map(value => text(value, 'version_state'))
      } : {}),
      ...(stateFactIds.length ? { stateFactIds } : {})
    };
  });
}

export async function encodeFramedSyncInventory(args: Parameters<typeof iterateFramedSyncInventory>[0]) {
  return Array.from(iterateFramedSyncInventory(args));
}

function inventoryPageCount(entries: readonly FramedSyncInventoryEntry[], offset: number,
  roundId: Uint8Array, chunkIndex: number, encode: ReturnType<typeof createFramedSyncProtocolEncoder>) {
  const maximum = Math.min(CHUNK_SIZE, entries.length - offset);
  let accepted = 0;
  let upper = maximum;
  // Bound materialized probes by growing from the previous fitting prefix.
  for (let count = 1; count <= maximum; count = Math.min(maximum, count * 2)) {
    const encoded = encode('inventory_chunk', chunk(entries.slice(offset, offset + count), roundId, chunkIndex));
    if (encoded.byteLength > FRAMED_SYNC_LIMITS.maxControlMessageBytes) {
      upper = count - 1;
      break;
    }
    accepted = count;
    if (count === maximum) break;
  }
  let lower = accepted + 1;
  while (lower <= upper) {
    const count = Math.floor((lower + upper) / 2);
    const encoded = encode('inventory_chunk', chunk(entries.slice(offset, offset + count), roundId, chunkIndex));
    if (encoded.byteLength <= FRAMED_SYNC_LIMITS.maxControlMessageBytes) {
      accepted = count;
      lower = count + 1;
    } else upper = count - 1;
  }
  if (!accepted) throw new Error('inventory_frame_limit_exceeded');
  return accepted;
}

export function* iterateFramedSyncInventory(args: {
  entries: readonly FramedSyncInventoryEntry[];
  roundId: Uint8Array;
  detailGlobalIds?: readonly string[];
  summaryOnly?: boolean;
}): Generator<InventorySessionMessage> {
  encodeValidatedProtocolMessage('inventory_begin', {
    entryCount: args.entries.length, roundId: args.roundId
  });
  yield {
    payload: { entryCount: args.entries.length, roundId: args.roundId, detailGlobalIds: args.detailGlobalIds ?? [], summaryOnly: args.summaryOnly ?? false },
    payloadCase: 'inventory_begin'
  };
  const session = budget();
  const encode = createFramedSyncProtocolEncoder();
  for (let offset = 0, chunkIndex = 0; offset < args.entries.length; chunkIndex += 1) {
    const count = inventoryPageCount(args.entries, offset, args.roundId, chunkIndex, encode);
    const payload = chunk(args.entries.slice(offset, offset + count), args.roundId, chunkIndex);
    session.add(encodedChunk(payload));
    yield { payload, payloadCase: 'inventory_chunk' };
    offset += count;
  }
  const inventoryHash = session.finish();
  yield {
    payload: { inventoryHash, roundId: args.roundId }, payloadCase: 'inventory_end'
  };
}

export async function decodeFramedSyncInventory(
  messages: Iterable<ValidatedProtocolMessage> | AsyncIterable<ValidatedProtocolMessage>,
  options: { retainEntries?: boolean; observeEntries?: (entries: readonly FramedSyncInventoryEntry[]) => void } = {}
) {
  const entries: FramedSyncInventoryEntry[] = [];
  const session = budget();
  let roundId: Uint8Array | undefined;
  let expectedCount = 0n;
  let chunkIndex = 0;
  let ended = false;
  let frames = 0;
  let receivedCount = 0;
  let detailGlobalIds: string[] = [];
  let summaryOnly = false;
  for await (const message of messages) {
    if (++frames > FRAMED_SYNC_LIMITS.maxSessionFrames) throw new Error('inventory_session_limit_exceeded');
    const payload = row(message.payload);
    if (!roundId) {
      if (message.payloadCase !== 'inventory_begin') throw new Error('inventory_exchange_incomplete');
      roundId = bytes(payload.roundId, 'round_id').slice();
      expectedCount = unsigned(payload.entryCount, 'entry_count');
      detailGlobalIds = list(payload.detailGlobalIds ?? []).map(value => text(value, 'detail_global_id'));
      summaryOnly = payload.summaryOnly === true;
      if (expectedCount > BigInt(FRAMED_SYNC_LIMITS.maxInventoryEntries)) throw new Error('inventory_entry_limit_exceeded');
      continue;
    }
    if (ended) throw new Error('inventory_exchange_incomplete');
    if (message.payloadCase === 'inventory_end') {
      if (!sameBytes(bytes(payload.roundId, 'round_id'), roundId) ||
          !sameBytes(bytes(payload.inventoryHash, 'inventory_hash'), session.finish()) ||
          BigInt(receivedCount) !== expectedCount) throw new Error('inventory_exchange_incomplete');
      ended = true;
      continue;
    }
    if (message.payloadCase !== 'inventory_chunk') throw new Error('inventory_exchange_incomplete');
    if (!sameBytes(bytes(payload.roundId, 'round_id'), roundId) ||
        unsigned(payload.chunkIndex, 'chunk_index') !== BigInt(chunkIndex)) {
      throw new Error('inventory_chunk_sequence_invalid');
    }
    const incoming = entriesFromWire(payload);
    session.add(encodedChunk(chunk(incoming, roundId, chunkIndex++)));
    receivedCount += incoming.length;
    if (BigInt(receivedCount) > expectedCount) throw new Error('inventory_entry_limit_exceeded');
    options.observeEntries?.(incoming);
    if (options.retainEntries !== false) entries.push(...incoming);
  }
  if (!roundId || !ended) throw new Error('inventory_exchange_incomplete');
  return { entries, roundId, ...(detailGlobalIds.length ? { detailGlobalIds } : {}), ...(summaryOnly ? { summaryOnly } : {}) };
}
