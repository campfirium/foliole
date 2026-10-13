// @vitest-environment node
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { restoreFramedSyncReview } from '../../lib/core/sync/framedSyncRelationReviewFact.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { applyReviewLogRecordsWithDbPort, type ReviewLogRecordInput } from '../../lib/core/sync/syncReviewLogApply.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

function history(count: number, bodySize = 32) {
  const records: NativeSyncNodeRecord[] = [];
  for (let index = 1; index <= count; index++) records.push(textBranch(`v${index}`,
    `${index}:` + 'b'.repeat(bodySize), records.at(-1), '2026-10-01T00:00:00.000Z'));
  return records;
}

function graph(peer: RestorePeer) {
  return {
    versions: peer.sqlite.prepare(`SELECT version_id, object_id, parent_version_id, content_hash
      FROM node_sync_versions WHERE object_id = 'topic' ORDER BY version_id`).all(),
    parents: peer.sqlite.prepare('SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents ORDER BY version_id').all()
  };
}

function bodies(peer: RestorePeer) {
  return peer.sqlite.prepare("SELECT version_id, body_text FROM node_sync_versions WHERE object_id = 'topic' ORDER BY version_id").all();
}

async function differences(source: RestorePeer, target: RestorePeer) {
  return compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db),
    remote: await readRequestSyncInventorySnapshot(target.db) }).filter(value => value.direction === 'local_to_remote');
}

async function send(source: RestorePeer, target: RestorePeer, type = 'node') {
  const difference = (await differences(source, target)).find(value => value.objectType === type && value.globalId === 'topic');
  if (!difference) throw new Error('known_facts_difference_missing');
  await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference, false);
  return difference;
}

it.each([{ count: 24, known: 23, retired: true }, { count: 130, known: 128, retired: false }])(
  'preserves $count original versions and parent edges after receiving $known known versions', async ({ count, known, retired }) => {
    const fixture = await restoreFixture();
    const source = fixture.peer('source'); const target = fixture.peer('target');
    try {
      const records = history(count, retired ? 200_000 : 32);
      await applySyncNodesWithDbPort(source.db, records);
      await applySyncNodesWithDbPort(target.db, records.slice(0, known));
      const expectedGraph = graph(source);
      const expectedBodies = bodies(source);
      if (retired) source.sqlite.exec(`UPDATE node_sync_versions SET body_text = NULL,
        snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_blob_hash', NULL)
        WHERE object_id = 'topic' AND version_id <> 'v24'`);
      expect(source.sqlite.prepare("SELECT count(*) FROM node_sync_versions WHERE body_text IS NULL AND object_id = 'topic'").pluck().get())
        .toBe(retired ? 23 : 0);
      const difference = await send(source, target);
      target.reopen();
      expect(graph(target)).toEqual(expectedGraph);
      expect(graph(target).versions).toHaveLength(count);
      expect(graph(target).parents).toHaveLength(count - 1);
      expect(bodies(target)).toEqual(expectedBodies);
      expect(target.sqlite.prepare("SELECT current_version_id, content FROM nodes WHERE id = 'topic'").get())
        .toEqual({ current_version_id: `v${count}`, content: records.at(-1)?.body_text });
      await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
        providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference, false);
      target.reopen();
      expect(graph(target)).toEqual(expectedGraph);
      expect(bodies(target)).toEqual(expectedBodies);
      expect(graph(source)).toEqual(expectedGraph);
    } finally { await fixture.close(); }
  });

function review(index: number): ReviewLogRecordInput {
  const suffix = String(index).padStart(4, '0');
  return { id: `review-${suffix}`, op_id: `op-${suffix}`, host_name: 'source', node_id: 'topic', grade: 3,
    scheduler_version: 'ts-fsrs@4', reviewed_at: '2026-10-01T00:00:00.000Z', due_before: 'before',
    stability_before: 1, difficulty_before: 2, due_after: 'after', stability_after: 3, difficulty_after: 4 };
}

it('requests only op-0259 from 260 review events and preserves every immutable field across replay and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const records = history(1); const reviews = Array.from({ length: 260 }, (_, index) => review(index));
    await applySyncNodesWithDbPort(source.db, records); await applySyncNodesWithDbPort(target.db, records);
    await applyReviewLogRecordsWithDbPort(source.db, reviews);
    await applyReviewLogRecordsWithDbPort(target.db, reviews.slice(0, 259));
    const difference = (await differences(source, target)).find(value => value.objectType === 'node' && value.globalId === 'topic');
    if (!difference) throw new Error('known_review_difference_missing');
    expect(difference.need.reviewFactIds).toEqual(['op-0259']);
    await withRequestSyncFiles(source.host.files, async request => {
      await writeRequestSyncSnapshot(source.db, difference, request);
      const selected = [];
      for await (const fact of request.readFacts()) if (fact.kind === 4) selected.push(restoreFramedSyncReview(fact));
      expect(selected).toEqual([reviews[259]]);
    });
    const progress = { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch };
    for (let replay = 0; replay < 2; replay++) {
      await transfer(source, target, progress, difference, false); target.reopen();
      expect(target.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(reviews);
      expect(graph(target)).toEqual(graph(source));
      expect(bodies(target)).toEqual(bodies(source));
    }
    expect(source.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(reviews);
    expect(await differences(source, target)).toEqual([]);
  } finally { await fixture.close(); }
});

it('discovers and persists an open-state change after 2050 already known versions and 2049 parent edges', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const records = history(2050);
    await applySyncNodesWithDbPort(source.db, records); await applySyncNodesWithDbPort(target.db, records);
    const expectedGraph = graph(source); const expectedBodies = bodies(source);
    expect(expectedGraph.versions).toHaveLength(2050); expect(expectedGraph.parents).toHaveLength(2049);
    const payload = { node_id: 'topic', last_opened_at: '2026-10-09T09:00:00.000Z' };
    await source.db.transaction(db => applySyncObjectInTransaction(db, { object_type: 'node_open_state', object_id: 'topic',
      payload_json: JSON.stringify(payload), content_hash: computeSyncContentHash('node_open_state', payload),
      updated_at: payload.last_opened_at, deleted_at: null }));
    expect((await differences(source, target)).map(value => value.objectType)).toEqual(['node_open_state']);
    const difference = await send(source, target, 'node_open_state');
    await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference, false);
    target.reopen();
    expect(target.sqlite.prepare("SELECT node_id, last_opened_at FROM node_open_state WHERE node_id = 'topic'").get()).toEqual(payload);
    expect(graph(target)).toEqual(expectedGraph); expect(bodies(target)).toEqual(expectedBodies);
    expect(graph(source)).toEqual(expectedGraph); expect(bodies(source)).toEqual(expectedBodies);
    expect(await differences(source, target)).toEqual([]);
  } finally { await fixture.close(); }
});
