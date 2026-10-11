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

it('streams one inventory object beyond the old 64 MiB session ceiling with bounded frames', async () => {
  const versions = Array.from({ length: 20_000 }, (_, index) => `${index}:${'a'.repeat(3500)}`);
  const original = entry(versions);
  const decoded = await decodeRequestSyncInventory(decode(iterateRequestSyncInventory({ entries: [original], roundId: new Uint8Array(16) })));
  expect(decoded.entries).toEqual([original]);
}, 30_000);

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
