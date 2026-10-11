import { expect, it } from 'vitest';

import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { readRequestSyncDifference, requestSyncDifferenceMessages } from './requestSyncDifferenceWire.js';

it('requests every missing version without a single large control frame', async () => {
  const ids = Array.from({ length: 20_000 }, (_, index) => `version-${index}-${'a'.repeat(40)}`);
  const difference: FramedSyncInventoryDifference = { direction: 'remote_to_local', objectType: 'node', globalId: 'topic',
    need: { frontierFactIds: ids, requiredRelationIds: [], reviewFactIds: [], resourceHashes: [], sharedState: false },
    sourceSnapshot: { objectType: 'node', globalId: 'topic', sharedStateHash: new Uint8Array(32), frontierFactIds: ids,
      requiredRelationIds: [], reviewFactIds: [], resourceHashes: [] } };
  let frames = 0;
  const messages = (async function* () {
    for await (const message of requestSyncDifferenceMessages(difference)) {
      const encoded = encodeValidatedProtocolMessage(message.payloadCase, message.payload);
      expect(encoded.length).toBeLessThanOrEqual(FRAMED_SYNC_LIMITS.maxControlMessageBytes);
      frames += 1;
      yield decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.sessionControl);
    }
  })();
  expect((await readRequestSyncDifference(messages)).facts.map(fact => fact.factId)).toEqual(ids);
  expect(frames).toBeGreaterThan(1);
});
