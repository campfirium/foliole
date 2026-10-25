// @vitest-environment node
import { expect, it } from 'vitest';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { parseFramedSyncNodeChildIdentity } from '../../lib/core/sync/framedSyncNodeChildFact.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';

import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { firstAt, seedReviewPeer, score, history, reset } from './reviewProjection.testSupport.js';

it('sends all review facts and no review snapshots through the production request snapshot after every mutation', async () => {
  const f = await restoreFixture(); const peer = f.peer('source');
  try {
    await seedReviewPeer(peer);
    const mutations = [
      () => score(peer, 'grade', firstAt),
      () => history(peer, 'undo', 'grade', '2026-10-02T08:00:00.000Z'),
      () => history(peer, 'redo', 'grade', '2026-10-03T08:00:00.000Z'),
      () => reset(peer, '2026-10-04T08:00:00.000Z')
    ];
    for (const [index, mutate] of mutations.entries()) {
      mutate();
      const differences = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(peer.db), remote: [] });
      expect(differences.some(value => value.objectType === 'node_review')).toBe(false);
      const difference = differences.find(value => value.globalId === 'topic' && value.objectType === 'node');
      if (!difference) throw new Error('missing_node_inventory');
      await withRequestSyncFiles(peer.host.files, async request => {
        await writeRequestSyncSnapshot(peer.db, { ...difference, direction: 'local_to_remote' }, request);
        const reviews: string[] = [];
        for await (const fact of request.readFacts()) {
          expect(fact.objectType).not.toBe('node_review');
          if (fact.kind === 1) expect(parseFramedSyncNodeChildIdentity(fact.factId).objectType).not.toBe('node_review');
          if (fact.kind === 4) reviews.push(fact.factId);
        }
        expect(reviews).toHaveLength(index + 1);
        expect(reviews).toContain('grade');
      });
    }
  } finally { await f.close(); }
});
