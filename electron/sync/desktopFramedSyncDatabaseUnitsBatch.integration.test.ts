// @vitest-environment node
import { expect, it } from 'vitest';

import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { canonicalContentId, canonicalTransferId, type CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { insertParentOrderVersion } from '../../lib/core/sync/syncParentOrderVersionStore.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { expectParentBatchDurable, parentBatchHttp, type ParentBatchFixture } from './desktopFramedSyncParentBatch.testSupport.js';
import { projectDesktopFramedSyncParentRelation, projectDesktopFramedSyncReview } from './desktopFramedSyncRelationReviewProjection.js';
import { verifiedReceiverFixture } from './desktopFramedSyncVerifiedReceiver.testSupport.js';

function review(nodeId: string) {
  return { id: `${nodeId}-review`, op_id: `${nodeId}-review-op`, host_name: 'sender', node_id: nodeId,
    grade: 3, scheduler_version: 'fsrs-6', reviewed_at: '2026-10-09T01:00:00.000Z',
    due_before: '2026-10-09T00:00:00.000Z', stability_before: 2.5, difficulty_before: 2.25,
    due_after: '2026-10-10T00:00:00.000Z', stability_after: 4.5, difficulty_after: 3.75 };
}

async function enrichNode(a: ParentBatchFixture, id: string) {
  const base = await loadCurrentSyncNodeRecord(a.sender.db, id);
  if (!base) throw new Error('test_node_missing');
  const next = textBranch(`${id}-next-version`, `${id} updated body`, base, '2026-10-09T01:00:00.000Z');
  next.object_id = id; next.snapshot.id = id;
  await a.sender.receive([next]);
  const row = review(id);
  a.sender.sqlite.prepare(`INSERT INTO review_log (id,op_id,host_name,node_id,grade,scheduler_version,
    reviewed_at,due_before,stability_before,difficulty_before,due_after,stability_after,difficulty_after)
    VALUES (@id,@op_id,@host_name,@node_id,@grade,@scheduler_version,@reviewed_at,@due_before,
      @stability_before,@difficulty_before,@due_after,@stability_after,@difficulty_after)`).run(row);
  saveNodeReadingStateWithSync(createBetterSqlite3Driver(a.sender.sqlite), { nodeId: id, hostName: 'sender',
    updatedAt: '2026-10-09T01:00:00.000Z', reading: { intervalDurationMs: 1000, intervalGrowthFactor: 2,
      lastHandledAt: '2026-10-09', nextAt: '2026-10-10', priority: 1, readingPosition: 0,
      repetitionCount: 1, state: 'active' } });
}

it('sends two actual node producers with reading, relation and review facts in one POST', async () => {
  const a = await verifiedReceiverFixture('aaa body', 'aaa');
  const c = await verifiedReceiverFixture('ccc body', 'ccc', a.sender);
  try {
    await enrichNode(a, 'aaa'); await enrichNode(a, 'ccc');
    const http = await parentBatchHttp(a);
    try {
      const inventory = await http.endpoint.readInventory();
      for (const entry of inventory.filter(entry => ['aaa', 'ccc'].includes(entry.globalId))) {
        expect(entry.stateFactIds).not.toEqual([]);
        expect(entry.reviewFactIds).toHaveLength(1);
        expect(entry.requiredRelationIds).toHaveLength(1);
      }
      const { transfers, deferred } = await http.deliver(['aaa', 'ccc']);
      expect(deferred).toEqual([]);
      expect(http.state.posts).toBe(1);
      for (const id of ['aaa', 'ccc']) {
        expect(await a.staging.loadReceipt(transfers.get(id)!)).toEqual(await a.receiver.staging.loadReceipt(transfers.get(id)!));
      }
      a.reopen();
      expect(a.receiver.sqlite.prepare('SELECT id,content FROM nodes ORDER BY id').all())
        .toEqual([{ id: 'aaa', content: 'aaa updated body' }, { id: 'ccc', content: 'ccc updated body' }]);
      expect(a.receiver.sqlite.prepare('SELECT count(*) FROM review_log').pluck().get()).toBe(2);
      expect(a.receiver.sqlite.prepare('SELECT count(*) FROM node_sync_version_parents').pluck().get()).toBe(2);
      expect(a.receiver.sqlite.prepare('SELECT count(*) FROM node_reading').pluck().get()).toBe(2);
      expect(a.receiver.sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(2);
    } finally { await http.close(); }
  } finally { c.close(); a.close(); }
});

it('packs actual order state units by size and retains their separate durable receipts', async () => {
  const a = await verifiedReceiverFixture('Unrelated', 'unrelated');
  try {
    await insertParentOrderVersion(a.sender.db, 'folder', { versionId: 'order-a', kind: 'baseline',
      order: ['aaa'], parentVersionIds: [] }, 'now');
    await insertParentOrderVersion(a.sender.db, 'folder', { versionId: 'order-c', kind: 'membership',
      order: ['aaa', 'ccc'], parentVersionIds: ['order-a'] }, 'now');
    const http = await parentBatchHttp(a);
    try {
      const { transfers, deferred } = await http.deliver(['order-a', 'order-c']);
      expect(deferred).toEqual([]);
      expect(http.state.posts).toBe(1);
      for (const id of ['order-a', 'order-c']) {
        expect(await a.staging.loadReceipt(transfers.get(id)!)).not.toBeNull();
        expect(await a.receiver.staging.loadReceipt(transfers.get(id)!)).toEqual(await a.staging.loadReceipt(transfers.get(id)!));
      }
      a.reopen();
      expect(a.receiver.sqlite.prepare('SELECT version_id,child_ids_json FROM parent_order_versions ORDER BY version_id').all())
        .toEqual([{ version_id: 'order-a', child_ids_json: '["aaa"]' }, { version_id: 'order-c', child_ids_json: '["aaa","ccc"]' }]);
      expect(a.receiver.sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(2);
    } finally { await http.close(); }
  } finally { a.close(); }
});

it.each(['review', 'relation'])('defers a scoped %s unit missing its original dependency while neighbors commit', async kind => {
  const a = await verifiedReceiverFixture('aaa complete body', 'aaa');
  const c = await verifiedReceiverFixture('ccc complete body', 'ccc', a.sender);
  try {
    const fact: CanonicalFact = kind === 'review' ? projectDesktopFramedSyncReview(review('middle'))
      : projectDesktopFramedSyncParentRelation({ object_id: 'middle', version_id: 'missing-version', parent_version_id: 'missing-base', ordinal: 0 });
    const manifest = { facts: [fact], blobs: [] };
    const contentId = await canonicalContentId(manifest);
    const transferId = await canonicalTransferId(a.context, contentId);
    const publication = { context: a.context, transferId, contentId, manifestHash: contentId, manifest };
    await a.staging.publishOutbound(publication);
    const http = await parentBatchHttp(a);
    try {
      const differences = compareFramedSyncInventories({ local: await http.endpoint.readInventory(), remote: [] });
      const neighbors = [];
      for (const difference of differences.filter(item => ['aaa', 'ccc'].includes(item.globalId))) {
        const selected = await http.endpoint.selectOutbound(difference);
        if (selected.kind !== 'published') throw new Error('test_neighbor_publication_missing');
        neighbors.push(selected.publication);
      }
      const states = await http.endpoint.sendPublishedTransfers([neighbors[0]!, publication, neighbors[1]!]);
      expect(states.map(state => state.state)).toEqual(['committed', 'deferred', 'committed']);
      expect(http.state.posts).toBe(4);
      expect(await a.staging.loadReceipt(transferId)).toBeNull();
      expect(await a.receiver.staging.loadReceipt(transferId)).toBeNull();
      await expectParentBatchDurable(a, new Map([['aaa', a.publication.transferId], ['ccc', c.publication.transferId]]), ['aaa', 'ccc']);
      expect(a.receiver.sqlite.prepare('SELECT count(*) FROM review_log').pluck().get()).toBe(0);
      expect(a.receiver.sqlite.prepare('SELECT count(*) FROM node_sync_version_parents').pluck().get()).toBe(0);
    } finally { await http.close(); }
  } finally { c.close(); a.close(); }
});
