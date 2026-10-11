import { expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import { decodeFramedSyncPreamble } from './framedSyncFraming.js';
import { prepareRequestSyncWire, readRequestSyncWire } from './requestSyncWire.js';

it('uses independent encryption contexts for fresh one-shot requests without a persistent nonce owner', async () => {
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: 'a', initiatorLibraryEpoch: 'a-epoch', responderDeviceId: 'b', responderLibraryEpoch: 'b-epoch' } as const;
  const groupKey = new Uint8Array(32).fill(7);
  const message = { payloadCase: 'round_receipt', payload: { roundId: new Uint8Array(16), result: 1, deferredFacts: [] } } as const;
  const input = { context, groupKey, messages: async function* () { yield message; } };
  const first = await prepareRequestSyncWire(input);
  const second = await prepareRequestSyncWire(input);
  const a = decodeFramedSyncPreamble(first.preamble);
  const b = decodeFramedSyncPreamble(second.preamble);
  if (a.contextKind !== 'session' || b.contextKind !== 'session') throw new Error('Expected session contexts');
  expect(a.sessionId).not.toEqual(b.sessionId);
  expect(a.contextId).not.toEqual(b.contextId);
  for (const stream of [first, second]) {
    const received = [];
    for await (const decoded of readRequestSyncWire({ context, groupKey, ...stream })) received.push(decoded.message);
    expect(received).toMatchObject([{ payloadCase: 'round_receipt', payload: { result: 1 } }]);
    expect(await stream.frames.next()).toEqual({ done: true, value: undefined });
  }
});
