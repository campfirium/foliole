import { expect, it } from 'vitest';

import { FRAMED_SYNC_FRAME_TYPES } from './framedSyncContract.js';
import {
  decodeFramedSyncDifferenceRequest,
  projectFramedSyncDifferenceRequest,
  resolveFramedSyncDifferenceRequest
} from './framedSyncDifferenceRequest.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';
import { decodeAndValidateProtocolMessage } from './framedSyncProtocolCodec.js';

const hash = (value: number, size = 32) => new Uint8Array(size).fill(value);

function difference(direction: FramedSyncInventoryDifference['direction'] = 'remote_to_local'):
FramedSyncInventoryDifference {
  return {
    direction, globalId: 'node-1', objectType: 'node',
    need: {
      frontierFactIds: ['version-2'], requiredRelationIds: ['relation-1'],
      resourceHashes: [hash(3)], reviewFactIds: ['review-1'], sharedState: true
    },
    sourceSnapshot: {
      frontierFactIds: ['version-2'], globalId: 'node-1', objectType: 'node',
      requiredRelationIds: ['relation-1'], resourceHashes: [hash(3)],
      reviewFactIds: ['review-1'], sharedStateHash: hash(4)
    }
  };
}

it('projects one remote Node difference into exact requested fact identities and blobs', () => {
  const projected = projectFramedSyncDifferenceRequest({ difference: difference(), roundId: hash(8, 16) });
  const decoded = decodeFramedSyncDifferenceRequest(decodeAndValidateProtocolMessage(
    projected.encoded, FRAMED_SYNC_FRAME_TYPES.sessionControl
  ));

  expect(decoded.facts).toEqual([
    { factId: 'version-2', globalId: 'node-1', kind: 2, objectType: 'node' },
    { factId: 'relation-1', globalId: 'node-1', kind: 3, objectType: 'node' },
    { factId: 'review-1', globalId: 'node-1', kind: 4, objectType: 'node' }
  ]);
  expect(decoded.blobHashes).toEqual([hash(3)]);
  expect(decoded.roundId).toEqual(hash(8, 16));
  expect(resolveFramedSyncDifferenceRequest(difference().sourceSnapshot, decoded)).toMatchObject({
    direction: 'local_to_remote', globalId: 'node-1', need: {
      frontierFactIds: ['version-2'], requiredRelationIds: ['relation-1'],
      reviewFactIds: ['review-1'], sharedState: true
    }
  });
});

it('echoes the complete observed Node snapshot instead of only the missing subset', () => {
  const input = difference();
  input.sourceSnapshot.requiredRelationIds = ['relation-1', 'relation-already-local'];
  const decoded = decodeFramedSyncDifferenceRequest(decodeAndValidateProtocolMessage(
    projectFramedSyncDifferenceRequest({ difference: input, roundId: hash(8, 16) }).encoded,
    FRAMED_SYNC_FRAME_TYPES.sessionControl
  ));

  expect(decoded.facts.filter((fact) => fact.kind === 3).map((fact) => fact.factId))
    .toEqual(['relation-1', 'relation-already-local']);
});

it('rejects when the Node inventory changes after the requester observed it', () => {
  const projected = projectFramedSyncDifferenceRequest({ difference: difference(), roundId: hash(8, 16) });
  const decoded = decodeFramedSyncDifferenceRequest(decodeAndValidateProtocolMessage(
    projected.encoded, FRAMED_SYNC_FRAME_TYPES.sessionControl
  ));
  expect(() => resolveFramedSyncDifferenceRequest({
    ...difference().sourceSnapshot, frontierFactIds: ['other-version']
  }, decoded)).toThrow('framed_sync_difference_request_source_changed');
  expect(() => resolveFramedSyncDifferenceRequest({
    ...difference().sourceSnapshot, resourceHashes: [hash(9)]
  }, decoded)).toThrow('framed_sync_difference_request_source_changed');
  expect(() => resolveFramedSyncDifferenceRequest({
    ...difference().sourceSnapshot,
    requiredRelationIds: ['relation-1', 'relation-added-after-inventory']
  }, decoded)).toThrow('framed_sync_difference_request_source_changed');
});

it('rejects a local-to-remote difference because it does not need a pull request', () => {
  expect(() => projectFramedSyncDifferenceRequest({
    difference: difference('local_to_remote'), roundId: hash(8, 16)
  })).toThrow('framed_sync_difference_request_direction_invalid');
});
