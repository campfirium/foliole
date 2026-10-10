import { requiredFramedSyncNodeVersionIds, type FramedSyncInventoryDifference } from './framedSyncInventory.js';
import type { InboundFactDescriptor } from './framedSyncStagingContract.js';

/** Match the full original wire request, including relation endpoint versions, before staging. */
export function assertFramedSyncRequestedTransferFacts(difference: FramedSyncInventoryDifference,
  actual: readonly Pick<InboundFactDescriptor, 'factId' | 'kind' | 'globalId' | 'objectType'>[]) {
  const need = difference.need;
  const versions = difference.objectType === 'node'
    ? requiredFramedSyncNodeVersionIds({ ...difference, direction: 'local_to_remote', need }) : [];
  const expected = new Set([
    ...(need.stateFactIds ?? []).map(id => key(1, id)), ...versions.map(id => key(2, id)),
    ...need.requiredRelationIds.map(id => key(3, id)), ...need.reviewFactIds.map(id => key(4, id))
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
