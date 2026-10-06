import { sha256 } from '@noble/hashes/sha2.js';

import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { bytes, list, row, text, unsigned } from './framedSyncDecodedValues.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import {
  encodeValidatedProtocolMessage,
  type ValidatedProtocolMessage
} from './framedSyncProtocolCodec.js';
import type { ProtocolPayloadCase } from './framedSyncReceiver.js';

type InventorySessionMessage = Readonly<{
  payload: unknown;
  payloadCase: ProtocolPayloadCase;
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
      hash.update(encoded);
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

export async function encodeFramedSyncInventory(args: {
  entries: readonly FramedSyncInventoryEntry[];
  roundId: Uint8Array;
}): Promise<readonly InventorySessionMessage[]> {
  encodeValidatedProtocolMessage('inventory_begin', {
    entryCount: args.entries.length, roundId: args.roundId
  });
  const messages: InventorySessionMessage[] = [{
    payload: { entryCount: args.entries.length, roundId: args.roundId },
    payloadCase: 'inventory_begin'
  }];
  const session = budget();
  for (let offset = 0, chunkIndex = 0; offset < args.entries.length; chunkIndex += 1) {
    let count = Math.min(CHUNK_SIZE, args.entries.length - offset);
    let payload = chunk(args.entries.slice(offset, offset + count), args.roundId, chunkIndex);
    let encoded = encodeValidatedProtocolMessage('inventory_chunk', payload);
    while (encoded.byteLength > FRAMED_SYNC_LIMITS.maxControlMessageBytes && count > 1) {
      count = Math.max(1, Math.floor(count / 2));
      payload = chunk(args.entries.slice(offset, offset + count), args.roundId, chunkIndex);
      encoded = encodeValidatedProtocolMessage('inventory_chunk', payload);
    }
    session.add(encodedChunk(payload));
    messages.push({ payload, payloadCase: 'inventory_chunk' });
    offset += count;
  }
  const inventoryHash = session.finish();
  messages.push({
    payload: { inventoryHash, roundId: args.roundId }, payloadCase: 'inventory_end'
  });
  return messages;
}

export async function decodeFramedSyncInventory(messages: readonly ValidatedProtocolMessage[]) {
  const begin = messages[0];
  const end = messages.at(-1);
  if (messages.length > FRAMED_SYNC_LIMITS.maxSessionFrames) throw new Error('inventory_session_limit_exceeded');
  if (messages.length < 2 || begin?.payloadCase !== 'inventory_begin' ||
      end?.payloadCase !== 'inventory_end') throw new Error('inventory_exchange_incomplete');
  const beginPayload = row(begin.payload);
  const roundId = bytes(beginPayload.roundId, 'round_id');
  const expectedCount = unsigned(beginPayload.entryCount, 'entry_count');
  if (expectedCount > BigInt(FRAMED_SYNC_LIMITS.maxInventoryEntries)) throw new Error('inventory_entry_limit_exceeded');
  const entries: FramedSyncInventoryEntry[] = [];
  const session = budget();
  for (let index = 1; index < messages.length - 1; index += 1) {
    const message = messages[index]!;
    if (message.payloadCase !== 'inventory_chunk') throw new Error('inventory_exchange_incomplete');
    const payload = row(message.payload);
    if (!sameBytes(bytes(payload.roundId, 'round_id'), roundId) ||
        unsigned(payload.chunkIndex, 'chunk_index') !== BigInt(index - 1)) {
      throw new Error('inventory_chunk_sequence_invalid');
    }
    session.add(encodedChunk(chunk(entriesFromWire(payload), roundId, index - 1)));
    const incoming = entriesFromWire(payload);
    if (BigInt(entries.length + incoming.length) > expectedCount) throw new Error('inventory_entry_limit_exceeded');
    entries.push(...incoming);
  }
  const endPayload = row(end.payload);
  const actualHash = session.finish();
  if (!sameBytes(bytes(endPayload.roundId, 'round_id'), roundId) ||
      !sameBytes(bytes(endPayload.inventoryHash, 'inventory_hash'), actualHash) ||
      BigInt(entries.length) !== expectedCount) throw new Error('inventory_exchange_incomplete');
  return { entries, roundId: roundId.slice() };
}
