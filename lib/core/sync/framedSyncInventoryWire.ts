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
    sharedStateHash: entry.sharedStateHash, stateFactIds: entry.stateFactIds ?? []
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
  // The current protobuf writer materializes bytes, so stop at the first oversized prefix.
  for (let count = 1; count <= maximum; count += 1) {
    const encoded = encode('inventory_chunk', chunk(entries.slice(offset, offset + count), roundId, chunkIndex));
    if (encoded.byteLength > FRAMED_SYNC_LIMITS.maxControlMessageBytes) break;
    accepted = count;
  }
  if (!accepted) throw new Error('inventory_frame_limit_exceeded');
  return accepted;
}

export function* iterateFramedSyncInventory(args: {
  entries: readonly FramedSyncInventoryEntry[];
  roundId: Uint8Array;
}): Generator<InventorySessionMessage> {
  encodeValidatedProtocolMessage('inventory_begin', {
    entryCount: args.entries.length, roundId: args.roundId
  });
  yield {
    payload: { entryCount: args.entries.length, roundId: args.roundId },
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
  messages: Iterable<ValidatedProtocolMessage> | AsyncIterable<ValidatedProtocolMessage>
) {
  const entries: FramedSyncInventoryEntry[] = [];
  const session = budget();
  let roundId: Uint8Array | undefined;
  let expectedCount = 0n;
  let chunkIndex = 0;
  let ended = false;
  let frames = 0;
  for await (const message of messages) {
    if (++frames > FRAMED_SYNC_LIMITS.maxSessionFrames) throw new Error('inventory_session_limit_exceeded');
    const payload = row(message.payload);
    if (!roundId) {
      if (message.payloadCase !== 'inventory_begin') throw new Error('inventory_exchange_incomplete');
      roundId = bytes(payload.roundId, 'round_id').slice();
      expectedCount = unsigned(payload.entryCount, 'entry_count');
      if (expectedCount > BigInt(FRAMED_SYNC_LIMITS.maxInventoryEntries)) throw new Error('inventory_entry_limit_exceeded');
      continue;
    }
    if (ended) throw new Error('inventory_exchange_incomplete');
    if (message.payloadCase === 'inventory_end') {
      if (!sameBytes(bytes(payload.roundId, 'round_id'), roundId) ||
          !sameBytes(bytes(payload.inventoryHash, 'inventory_hash'), session.finish()) ||
          BigInt(entries.length) !== expectedCount) throw new Error('inventory_exchange_incomplete');
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
    if (BigInt(entries.length + incoming.length) > expectedCount) throw new Error('inventory_entry_limit_exceeded');
    entries.push(...incoming);
  }
  if (!roundId || !ended) throw new Error('inventory_exchange_incomplete');
  return { entries, roundId };
}
