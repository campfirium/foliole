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

const CHUNK_SIZE = 128;

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}

function concat(values: readonly Uint8Array[]) {
  const output = new Uint8Array(values.reduce((total, value) => total + value.byteLength, 0));
  let offset = 0;
  for (const value of values) { output.set(value, offset); offset += value.byteLength; }
  return output;
}

function entryToWire(entry: FramedSyncInventoryEntry) {
  return {
    frontierFactIds: entry.frontierFactIds, globalId: entry.globalId,
    objectType: entry.objectType, requiredRelationIds: entry.requiredRelationIds,
    resourceHashes: entry.resourceHashes, reviewFactIds: entry.reviewFactIds,
    sharedStateHash: entry.sharedStateHash
  };
}

function entriesFromWire(value: unknown): readonly FramedSyncInventoryEntry[] {
  return list(row(value).entries).map((item) => {
    const entry = row(item);
    const strings = (key: string) => list(entry[key]).map((part) => text(part, key));
    return {
      frontierFactIds: strings('frontierFactIds'),
      globalId: text(entry.globalId, 'global_id'),
      objectType: text(entry.objectType, 'object_type'),
      requiredRelationIds: strings('requiredRelationIds'),
      resourceHashes: list(entry.resourceHashes).map((hash) => bytes(hash, 'resource_hash').slice()),
      reviewFactIds: strings('reviewFactIds'),
      sharedStateHash: bytes(entry.sharedStateHash, 'shared_state_hash').slice()
    };
  });
}

export async function encodeFramedSyncInventory(args: {
  entries: readonly FramedSyncInventoryEntry[];
  roundId: Uint8Array;
}): Promise<readonly InventorySessionMessage[]> {
  const messages: InventorySessionMessage[] = [{
    payload: { entryCount: args.entries.length, roundId: args.roundId },
    payloadCase: 'inventory_begin'
  }];
  const encodedChunks: Uint8Array[] = [];
  for (let offset = 0, chunkIndex = 0; offset < args.entries.length;
    offset += CHUNK_SIZE, chunkIndex += 1) {
    const payload = {
      chunkIndex,
      entries: args.entries.slice(offset, offset + CHUNK_SIZE).map(entryToWire),
      roundId: args.roundId
    };
    encodedChunks.push(encodeValidatedProtocolMessage('inventory_chunk', payload));
    messages.push({ payload, payloadCase: 'inventory_chunk' });
  }
  const inventoryHash = new Uint8Array(await crypto.subtle.digest('SHA-256', concat(encodedChunks)));
  messages.push({
    payload: { inventoryHash, roundId: args.roundId }, payloadCase: 'inventory_end'
  });
  return messages;
}

export async function decodeFramedSyncInventory(messages: readonly ValidatedProtocolMessage[]) {
  const begin = messages[0];
  const end = messages.at(-1);
  if (messages.length < 2 || begin?.payloadCase !== 'inventory_begin' ||
      end?.payloadCase !== 'inventory_end') throw new Error('inventory_exchange_incomplete');
  const beginPayload = row(begin.payload);
  const roundId = bytes(beginPayload.roundId, 'round_id');
  const expectedCount = unsigned(beginPayload.entryCount, 'entry_count');
  const entries: FramedSyncInventoryEntry[] = [];
  const encodedChunks: Uint8Array[] = [];
  for (let index = 1; index < messages.length - 1; index += 1) {
    const message = messages[index]!;
    if (message.payloadCase !== 'inventory_chunk') throw new Error('inventory_exchange_incomplete');
    const payload = row(message.payload);
    if (!sameBytes(bytes(payload.roundId, 'round_id'), roundId) ||
        unsigned(payload.chunkIndex, 'chunk_index') !== BigInt(index - 1)) {
      throw new Error('inventory_chunk_sequence_invalid');
    }
    entries.push(...entriesFromWire(payload));
    encodedChunks.push(encodeValidatedProtocolMessage(message.payloadCase, message.payload));
  }
  const endPayload = row(end.payload);
  const actualHash = new Uint8Array(await crypto.subtle.digest('SHA-256', concat(encodedChunks)));
  if (!sameBytes(bytes(endPayload.roundId, 'round_id'), roundId) ||
      !sameBytes(bytes(endPayload.inventoryHash, 'inventory_hash'), actualHash) ||
      BigInt(entries.length) !== expectedCount) throw new Error('inventory_exchange_incomplete');
  return { entries, roundId: roundId.slice() };
}
