import { expect, it } from 'vitest';

import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { frameTypeForPayload } from './framedSyncReceiver.js';
import { readRequestSyncBatchDifferences, requestSyncBatchDifferences } from './requestSyncBatchDifference.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';

const batchId = new Uint8Array(16).fill(255);
function difference(index: number): FramedSyncInventoryDifference {
  const globalId = `node-${index}`;
  return { direction: 'remote_to_local', objectType: 'node', globalId,
    need: { frontierFactIds: [`version-${index}`], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [], sharedState: false },
    sourceSnapshot: { objectType: 'node', globalId, sharedStateHash: new Uint8Array(32), frontierFactIds: [`version-${index}`],
      requiredRelationIds: [], reviewFactIds: [], resourceHashes: [] } };
}
async function* decode(messages: AsyncIterable<RequestSyncMessage>, truncate = false) {
  for await (const message of messages) {
    if (truncate && message.payloadCase === 'request_batch_end') continue;
    yield decodeAndValidateProtocolMessage(encodeValidatedProtocolMessage(message.payloadCase, message.payload),
      frameTypeForPayload(message.payloadCase));
  }
}
function batch(count: number) {
  return requestSyncBatchDifferences(Array.from({ length: count }, (_, i) => difference(i)),
    Array.from({ length: count }, (_, i) => new Uint8Array(16).fill(i)), batchId);
}

it('reads exactly 128 distinct object requests with their correlation ids', async () => {
  const result = await readRequestSyncBatchDifferences(decode(batch(128)));
  expect(result.requests).toHaveLength(128);
  expect(result.requests.map(request => request.facts[0]?.globalId)).toEqual(Array.from({ length: 128 }, (_, i) => `node-${i}`));
  expect([...result.requests[127]!.roundId]).toEqual([...new Uint8Array(16).fill(127)]);
});

it('rejects a 129th object and a missing batch terminator', async () => {
  await expect(readRequestSyncBatchDifferences(decode(batch(129)))).rejects.toThrow('request_sync_batch_size_invalid');
  await expect(readRequestSyncBatchDifferences(decode(batch(1), true))).rejects.toThrow('request_sync_batch_end_missing');
});

it('rejects repeated object identity even with distinct request ids', async () => {
  const messages = requestSyncBatchDifferences([difference(1), difference(1)], [new Uint8Array(16), new Uint8Array(16).fill(1)], batchId);
  await expect(readRequestSyncBatchDifferences(decode(messages))).rejects.toThrow('request_sync_batch_identity_duplicate');
});
