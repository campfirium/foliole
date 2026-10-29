import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it } from 'vitest';

import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { decodeRequestSyncInventory, iterateRequestSyncInventory } from './requestSyncInventoryWire.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';

function entry(versions: readonly string[]): FramedSyncInventoryEntry {
  return { objectType: 'node', globalId: 'large-history', sharedStateHash: new Uint8Array(32),
    frontierFactIds: [], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
    stateFactIds: [], versionStates: versions, currentVersionId: 'head', unready: false };
}

async function* decode(messages: Iterable<RequestSyncMessage>) {
  for (const message of messages) {
    const encoded = encodeValidatedProtocolMessage(message.payloadCase, message.payload);
    expect(encoded.length).toBeLessThanOrEqual(FRAMED_SYNC_LIMITS.maxControlMessageBytes);
    yield decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.sessionControl);
  }
}

it('streams one inventory object beyond the old 64 MiB session ceiling with bounded frames', { meta: { calibratedMs: 30_000 } }, async () => {
  const versions = Array.from({ length: 20_000 }, (_, index) => `${index}:${'a'.repeat(3500)}`);
  const original = entry(versions);
  const decoded = await decodeRequestSyncInventory(decode(iterateRequestSyncInventory({ entries: [original], roundId: new Uint8Array(16) })));
  expect(decoded.entries).toEqual([original]);
});

it.each(['missing-part', 'wrong-index', 'wrong-object', 'duplicate-part'] as const)('rejects %s before returning an inventory', async fault => {
  const messages = [...iterateRequestSyncInventory({ entries: [entry(Array.from({ length: 4000 }, (_, index) => `v${index}`))], roundId: new Uint8Array(16) })];
  if (fault === 'missing-part') messages.splice(2, 1);
  else if (fault === 'duplicate-part') messages.splice(2, 0, messages[1]!);
  else {
    const payload = messages[2]!.payload as { entryPartIndex: number; entries: { globalId: string }[] };
    if (fault === 'wrong-index') payload.entryPartIndex = 9;
    else payload.entries[0]!.globalId = 'other';
  }
  await expect(decodeRequestSyncInventory(decode(messages))).rejects.toThrow(/inventory_/u);
});

it('packs small entries into bounded frames without changing their order or identity', async () => {
  const entries = Array.from({ length: 5000 }, (_, index) => ({ ...entry([]), globalId: `node-${index}` }));
  const messages = [...iterateRequestSyncInventory({ entries, roundId: new Uint8Array(16) })];
  expect(messages.filter(message => message.payloadCase === 'inventory_chunk').length).toBeLessThan(50);
  expect((await decodeRequestSyncInventory(decode(messages))).entries).toEqual(entries);
});

it.each(['duplicate', 'reorder', 'truncate', 'alter'] as const)('rejects a %s packed inventory', async fault => {
  const entries = Array.from({ length: 300 }, (_, index) => ({ ...entry([]), globalId: `node-${index}` }));
  const messages = [...iterateRequestSyncInventory({ entries, roundId: new Uint8Array(16) })];
  if (fault === 'duplicate') messages.splice(2, 0, messages[1]!);
  if (fault === 'reorder') [messages[1], messages[2]] = [messages[2]!, messages[1]!];
  if (fault === 'truncate') messages.pop();
  if (fault === 'alter') {
    const payload = messages[1]!.payload as { entries: { globalId: string }[] };
    payload.entries[0]!.globalId = 'altered';
  }
  await expect(decodeRequestSyncInventory(decode(messages))).rejects.toThrow(/inventory_/u);
});

it('hashes the received encoding, including authenticated protobuf extensions, without re-encoding', async () => {
  const messages = [...iterateRequestSyncInventory({ entries: [entry([])], roundId: new Uint8Array(16) })];
  const chunk = encodeValidatedProtocolMessage('inventory_chunk', messages[1]!.payload);
  const encoded = new Uint8Array(chunk.length + 3);
  encoded.set(chunk);
  encoded.set([0xf8, 0x07, 1], chunk.length);
  const end = { roundId: new Uint8Array(16), inventoryHash: sha256(encoded) };
  const decoded = (async function* () {
    yield decodeAndValidateProtocolMessage(encodeValidatedProtocolMessage('inventory_begin', messages[0]!.payload), 1);
    yield decodeAndValidateProtocolMessage(encoded, 1);
    yield decodeAndValidateProtocolMessage(encodeValidatedProtocolMessage('inventory_end', end), 1);
  })();
  expect((await decodeRequestSyncInventory(decoded)).entries).toEqual([entry([])]);
});

it('rejects altered bucket summaries against the ending root hash', async () => {
  const hashes = new Uint8Array(1024 * 32);
  const messages = [...iterateRequestSyncInventory({ entries: [], roundId: new Uint8Array(16),
    bucketSummary: true, bucketHashes: hashes })];
  hashes[0] = 1;
  await expect(decodeRequestSyncInventory(decode(messages))).rejects.toThrow('inventory_exchange_incomplete');
});

it('carries every required node identity for a 14241-member list through bounded inventory parts', async () => {
  const dailyFlowNodeIds = Array.from({ length: 14_241 }, (_, index) => `node-${index}`);
  const current = { ...entry([]), objectType: 'daily_flow', globalId: 'list', dailyFlowRootId: 'list',
    dailyFlowCurrent: true, dailyFlowComplete: true, dailyFlowNodeIds };
  const messages = [...iterateRequestSyncInventory({ entries: [current], roundId: new Uint8Array(16) })];
  expect(messages.length).toBeGreaterThan(3);
  const result = await decodeRequestSyncInventory(decode(messages));
  expect(result.entries[0]).toMatchObject({ dailyFlowRootId: 'list', dailyFlowCurrent: true, dailyFlowComplete: true, dailyFlowNodeIds });
});
