import type { FramedSyncInventoryNeed } from './framedSyncInventory.js';
import type { RequestSyncFiles } from './requestSyncFiles.js';

export async function assertReceivedRequestFacts(files: RequestSyncFiles, need: FramedSyncInventoryNeed) {
  const expected = new Set([
    ...need.frontierFactIds.map(id => `2\0${id}`),
    ...need.requiredRelationIds.map(id => `3\0${id}`),
    ...need.reviewFactIds.map(id => `4\0${id}`),
    ...(need.stateFactIds ?? []).map(id => `1\0${id}`)
  ]);
  for await (const fact of files.readFacts()) {
    if (!expected.delete(`${fact.kind}\0${fact.factId}`)) throw new Error('request_sync_fact_selection_mismatch');
  }
  if (expected.size) throw new Error('request_sync_fact_selection_incomplete');
}
