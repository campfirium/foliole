import { expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import { decodeFramedSyncPreamble } from './framedSyncFraming.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncWireFrame } from './requestSyncWire.js';

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

it.each(['ciphertext', 'sequence'] as const)('rejects a request with invalid %s before yielding a message', async fault => {
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: 'a', initiatorLibraryEpoch: 'a-epoch', responderDeviceId: 'b', responderLibraryEpoch: 'b-epoch' } as const;
  const groupKey = new Uint8Array(32).fill(7);
  const message = { payloadCase: 'round_receipt', payload: { roundId: new Uint8Array(16), result: 1, deferredFacts: [] } } as const;
  const stream = await prepareRequestSyncWire({ context, groupKey,
    messages: async function* () { yield message; yield message; } });
  const frames: RequestSyncWireFrame[] = [];
  for await (const frame of stream.frames) frames.push(frame);
  const valid = [];
  for await (const decoded of readRequestSyncWire({ context, groupKey, preamble: stream.preamble,
    frames: (async function* () { yield* frames; })() })) valid.push(decoded.message);
  expect(valid).toHaveLength(2);
  const invalid = fault === 'sequence' ? frames.slice(1) : frames.map((frame, index) => index === 0
    ? { ...frame, ciphertext: frame.ciphertext.map((byte, offset) => offset === 0 ? byte ^ 1 : byte) } : frame);
  const received: unknown[] = [];
  await expect((async () => {
    for await (const decoded of readRequestSyncWire({ context, groupKey, preamble: stream.preamble,
      frames: (async function* () { yield* invalid; })() })) received.push(decoded.message);
  })()).rejects.toThrow(fault === 'ciphertext' ? 'frame_authentication_failed' : 'frame_sequence_not_contiguous');
  expect(received).toEqual([]);
});
