import { requiredFramedSyncNodeVersionIds, type FramedSyncInventoryDifference } from './framedSyncInventory.js';
import type { InboundFactDescriptor } from './framedSyncStagingContract.js';

/** Match the full original wire request, including relation endpoint versions, before staging. */
export function assertFramedSyncRequestedTransferFacts(difference: FramedSyncInventoryDifference,
  actual: readonly Pick<InboundFactDescriptor, 'factId' | 'kind' | 'globalId' | 'objectType'>[]) {
  const source = difference.sourceSnapshot;
  const need = { frontierFactIds: source.frontierFactIds, requiredRelationIds: source.requiredRelationIds,
    resourceHashes: source.resourceHashes, reviewFactIds: source.reviewFactIds,
    stateFactIds: source.stateFactIds ?? [], sharedState: source.frontierFactIds.length > 0 || source.objectType !== 'node' };
  const versions = difference.objectType === 'node'
    ? requiredFramedSyncNodeVersionIds({ ...difference, direction: 'local_to_remote', need }) : [];
  const expected = new Set([
    ...(source.stateFactIds ?? []).map(id => key(1, id)), ...versions.map(id => key(2, id)),
    ...source.requiredRelationIds.map(id => key(3, id)), ...source.reviewFactIds.map(id => key(4, id))
  ]);
  if (!expected.size || actual.length !== expected.size) throw new Error('framed_sync_requested_fact_set_mismatch');
  const received = new Set<string>();
  for (const fact of actual) {
    const identity = key(fact.kind, fact.factId);
    if (fact.objectType !== difference.objectType || fact.globalId !== difference.globalId ||
        !expected.has(identity) || received.has(identity)) throw new Error('framed_sync_requested_fact_set_mismatch');
    received.add(identity);
  }
}

function key(kind: number, id: string) { return `${kind}\0${id}`; }
