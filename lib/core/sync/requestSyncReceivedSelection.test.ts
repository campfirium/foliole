import { expect, it } from 'vitest';

import { withRequestSyncFiles } from './requestSyncFiles.js';
import { assertReceivedRequestFacts } from './requestSyncReceivedSelection.js';

const files = { read: async () => null, write: async () => undefined, remove: async () => undefined };
const need = { frontierFactIds: ['v1', 'v2'], requiredRelationIds: [], reviewFactIds: [],
  stateFactIds: [], resourceHashes: [], sharedState: true };

it.each([
  { ids: ['v1', 'v2'], error: null },
  { ids: ['v1'], error: 'request_sync_fact_selection_incomplete' },
  { ids: ['v1', 'v2', 'v3'], error: 'request_sync_fact_selection_mismatch' },
  { ids: ['v1', 'v1'], error: 'request_sync_fact_selection_mismatch' }
])('requires exactly the requested identities: $ids', async ({ ids, error }) => {
  await withRequestSyncFiles(files, async received => {
    for (const factId of ids) await received.writeFact({ factId, globalId: 'node', objectType: 'node',
      kind: 2, sharedStateHash: new Uint8Array(32), body: [], blobs: [] });
    const result = assertReceivedRequestFacts(received, need);
    if (error) await expect(result).rejects.toThrow(error);
    else await expect(result).resolves.toBeUndefined();
  });
});
