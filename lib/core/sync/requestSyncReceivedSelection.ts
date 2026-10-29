import type { FramedSyncInventoryNeed } from './framedSyncInventory.js';
import type { RequestSyncFiles } from './requestSyncFiles.js';

export async function assertReceivedRequestFacts(files: RequestSyncFiles, need: FramedSyncInventoryNeed) {
  if (files.dailyFlow.begin) {
    if (!files.dailyFlow.complete || need.frontierFactIds.length || need.requiredRelationIds.length || need.reviewFactIds.length ||
        (need.stateFactIds?.length ?? 0) !== 1) throw new Error('daily_flow_table_selection_invalid');
    for await (const record of files.dailyFlow.records()) {
      if (record.fact?.factId === files.dailyFlow.begin.requestedFactId) {
        const { bytesToHex } = await import('@noble/hashes/utils.js');
        if (need.stateFactIds![0] !== 'daily_flow:' + bytesToHex(record.fact.contentHash)) throw new Error('daily_flow_table_selection_invalid');
        return;
      }
    }
    throw new Error('daily_flow_table_selection_incomplete');
  }
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
