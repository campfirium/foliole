import { expect, it } from 'vitest';

import { FRAMED_SYNC_FRAME_TYPES } from './framedSyncContract.js';
import { decodeFramedSyncDifferenceRequest } from './framedSyncDifferenceRequest.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';

const demand = { bodyHash: 'a'.repeat(64), demandId: 'demand-1', globalId: 'article',
  sharedStateHash: new Uint8Array(32).fill(3), storageKey: `${'b'.repeat(64)}.png`, versionId: 'version' };
const request = { blobHashes: [], facts: [], resources: [demand], roundId: new Uint8Array(16).fill(4) };

it('roundtrips a receiver attachment demand without requesting any database or body facts', () => {
  const encoded = encodeValidatedProtocolMessage('difference_request', request);
  const decoded = decodeFramedSyncDifferenceRequest(decodeAndValidateProtocolMessage(encoded,
    FRAMED_SYNC_FRAME_TYPES.sessionControl));
  expect(decoded).toEqual(request);
});

it.each([
  { ...request, resources: [demand, demand] },
  { ...request, resources: [{ ...demand, bodyHash: 'invalid' }] },
  { ...request, resources: [{ ...demand, demandId: '' }] },
  { ...request, resources: [{ ...demand, storageKey: '../outside.png' }] },
  { ...request, resources: [{ ...demand, sharedStateHash: new Uint8Array(31) }] },
  { ...request, blobHashes: [new Uint8Array(32)] },
  { ...request, facts: [{ globalId: 'article', objectType: 'node', kind: 2, factId: 'version' }] }
])('rejects ambiguous or invalid attachment demand input (%#)', (payload) => {
  expect(() => encodeValidatedProtocolMessage('difference_request', payload)).toThrow();
});
