import { expect, it } from 'vitest';

import { compareFramedSyncInventories } from './framedSyncInventory.js';
import { framedSyncParentRelationFactId } from './framedSyncRelationReviewFact.js';
import { assertFramedSyncRequestedTransferFacts } from './framedSyncRequestedTransferFacts.js';

function request(objectType = 'node') {
  const [difference] = compareFramedSyncInventories({ local: [], remote: [{ objectType, globalId: 'requested',
    frontierFactIds: objectType === 'node' ? ['version'] : [], requiredRelationIds: [], resourceHashes: [],
    reviewFactIds: [], stateFactIds: objectType === 'node' ? [] : ['state'], sharedStateHash: new Uint8Array(32) }] });
  if (!difference) throw new Error('test_difference_missing');
  return difference;
}

it('binds the full requested source even when the local missing subset is smaller', () => {
  const difference = request();
  const current = { ...difference, need: { ...difference.need, frontierFactIds: [], sharedState: false } };
  expect(() => assertFramedSyncRequestedTransferFacts(current,
    [{ kind: 2, factId: 'version', globalId: 'requested', objectType: 'node' }])).not.toThrow();
  expect(() => assertFramedSyncRequestedTransferFacts(current, [])).toThrow('framed_sync_requested_fact_set_mismatch');
});

it('rejects wrong objects, wrong kinds, extra facts and duplicates before admission', () => {
  const difference = request('setting');
  const correct = { kind: 1, factId: 'state', globalId: 'requested', objectType: 'setting' };
  expect(() => assertFramedSyncRequestedTransferFacts(difference, [correct])).not.toThrow();
  for (const facts of [[{ ...correct, globalId: 'different' }], [{ ...correct, kind: 2 }],
    [{ ...correct, objectType: 'node' }], [{ ...correct, factId: 'different' }], [correct, correct]]) {
    expect(() => assertFramedSyncRequestedTransferFacts(difference, facts)).toThrow('framed_sync_requested_fact_set_mismatch');
  }
});

it('requires the original relation endpoint versions as well as the frontier', () => {
  const original = request();
  const relation = framedSyncParentRelationFactId({ ordinal: 0, version_id: 'version', parent_version_id: 'parent' });
  const difference = { ...original, sourceSnapshot: { ...original.sourceSnapshot, requiredRelationIds: [relation] } };
  const facts = [{ kind: 2, factId: 'version', globalId: 'requested', objectType: 'node' },
    { kind: 3, factId: relation, globalId: 'requested', objectType: 'node' }];
  expect(() => assertFramedSyncRequestedTransferFacts(difference, facts)).toThrow('framed_sync_requested_fact_set_mismatch');
  expect(() => assertFramedSyncRequestedTransferFacts(difference,
    [...facts, { kind: 2, factId: 'parent', globalId: 'requested', objectType: 'node' }])).not.toThrow();
});
