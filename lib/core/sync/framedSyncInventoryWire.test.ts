// @vitest-environment node

import { expect, it } from 'vitest';

import { FRAMED_SYNC_FRAME_TYPES } from './framedSyncContract.js';
import {
  decodeFramedSyncInventory,
  encodeFramedSyncInventory
} from './framedSyncInventoryWire.js';
import {
  decodeAndValidateProtocolMessage,
  encodeValidatedProtocolMessage
} from './framedSyncProtocolCodec.js';

const roundId = Uint8Array.from({ length: 16 }, () => 4);

function entries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    frontierFactIds: [`version-${index}`],
    globalId: `node-${index.toString().padStart(3, '0')}`,
    objectType: 'node',
    requiredRelationIds: [],
    resourceHashes: [Uint8Array.from({ length: 32 }, () => index % 255)],
    reviewFactIds: [],
    sharedStateHash: Uint8Array.from({ length: 32 }, () => (index + 1) % 255)
  }));
}

function validate(messages: Awaited<ReturnType<typeof encodeFramedSyncInventory>>) {
  return messages.map((message) => decodeAndValidateProtocolMessage(
    encodeValidatedProtocolMessage(message.payloadCase, message.payload),
    FRAMED_SYNC_FRAME_TYPES.sessionControl
  ));
}

it('roundtrips a multi-chunk inventory with one stable round identity', async () => {
  const input = entries(129);
  const messages = await encodeFramedSyncInventory({ entries: input, roundId });

  expect(messages.map((message) => message.payloadCase)).toEqual([
    'inventory_begin', 'inventory_chunk', 'inventory_chunk', 'inventory_end'
  ]);
  await expect(decodeFramedSyncInventory(validate(messages))).resolves.toEqual({
    entries: input, roundId
  });
});

it.each([4097, 10000])('exchanges every entry in a %i object inventory', async (count) => {
  const input = entries(count);
  const encoded = await encodeFramedSyncInventory({ entries: input, roundId });
  const decoded = await decodeFramedSyncInventory(validate(encoded));
  expect(decoded.entries).toEqual(input);
});

it('splits large history entries by encoded frame size without losing state facts', async () => {
  const input = entries(4).map((entry) => ({ ...entry,
    frontierFactIds: Array.from({ length: 3000 }, (_, index) => `version-${index}-${'v'.repeat(100)}`),
    stateFactIds: ['node_reading:' + 'a'.repeat(64)]
  }));
  const encoded = await encodeFramedSyncInventory({ entries: input, roundId });
  expect(encoded.filter((message) => message.payloadCase === 'inventory_chunk').length)
    .toBeGreaterThan(1);
  const decoded = await decodeFramedSyncInventory(validate(encoded));
  expect(decoded.entries).toEqual(input);
});

it('rejects missing chunks and an inventory hash mismatch', async () => {
  const messages = await encodeFramedSyncInventory({ entries: entries(129), roundId });
  const withoutChunk = validate(messages.filter((_message, index) => index !== 1));
  await expect(decodeFramedSyncInventory(withoutChunk))
    .rejects.toThrow('inventory_chunk_sequence_invalid');

  const validated = validate(messages);
  const end = validated.at(-1)!;
  const corrupted = [...validated.slice(0, -1), decodeAndValidateProtocolMessage(
    encodeValidatedProtocolMessage('inventory_end', {
      ...end.payload, inventoryHash: new Uint8Array(32)
    }), FRAMED_SYNC_FRAME_TYPES.sessionControl
  )];
  await expect(decodeFramedSyncInventory(corrupted))
    .rejects.toThrow('inventory_exchange_incomplete');
});
