import protobuf from 'protobufjs';
import { expect, it, vi } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import schema from './generated/framed-sync-v28-schema.json' with { type: 'json' };
import { respondRequestSyncRoundControl } from './requestSyncPeerRound.js';
import { prepareRequestSyncWire, readRequestSyncWire } from './requestSyncWire.js';

const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'a', initiatorLibraryEpoch: 'epoch-a', responderDeviceId: 'b', responderLibraryEpoch: 'epoch-b' } as const;
const groupKey = new Uint8Array(32).fill(7);
const id = '11111111-1111-4111-8111-111111111111';
const roundId = Uint8Array.from(id.replaceAll('-', '').match(/../g)!, value => Number.parseInt(value, 16));

it.each([false, true])('refreshes only a confirmed exchange, not a drained cleanup (%s)', async confirmed => {
  const onCompleted = vi.fn(async () => {});
  const stream = await prepareRequestSyncWire({ context, groupKey, messages: async function* () {
    yield { payloadCase: 'round_receipt', payload: { roundId, result: 1, deferredFacts: [], databaseConfirmed: confirmed } };
  } });
  const response = await respondRequestSyncRoundControl({ context, groupKey, stream, roundId: id, onCompleted });
  const replies = [];
  for await (const message of readRequestSyncWire({ context, groupKey, ...response })) replies.push(message);
  expect(onCompleted).toHaveBeenCalledTimes(confirmed ? 1 : 0);
  expect(replies[0]!.message.payload.result).toBe(1);
});

it('does not refresh after an invalid round identity', async () => {
  const onCompleted = vi.fn(async () => {});
  const stream = await prepareRequestSyncWire({ context, groupKey, messages: async function* () {
    yield { payloadCase: 'round_receipt', payload: { roundId: new Uint8Array(16), result: 2, deferredFacts: [] } };
  } });
  await expect(respondRequestSyncRoundControl({ context, groupKey, stream, roundId: id, onCompleted }))
    .rejects.toThrow('sync_round_control_invalid');
  expect(onCompleted).not.toHaveBeenCalled();
});

it('keeps a new completion receipt decodable by the deployed schema and its result=1 guard', () => {
  const legacySchema = structuredClone(schema);
  const fields = legacySchema.nested.foliole.nested.sync.nested.v22.nested.RoundReceipt.fields;
  Reflect.deleteProperty(fields, 'databaseConfirmed');
  const legacy = protobuf.Root.fromJSON(legacySchema as protobuf.INamespace).lookupType('foliole.sync.v22.ProtocolMessage');
  const current = protobuf.Root.fromJSON(schema as protobuf.INamespace).lookupType('foliole.sync.v22.ProtocolMessage');
  const wire = current.encode(current.create({ roundReceipt: { roundId, result: 1,
    deferredFacts: [], databaseConfirmed: true } })).finish();
  const receipt = legacy.toObject(legacy.decode(wire)).roundReceipt;
  expect(receipt.result).toBe(1);
  expect(Uint8Array.from(receipt.roundId)).toEqual(roundId);
  expect(receipt.databaseConfirmed).toBeUndefined();
});
