// @vitest-environment node
import { expect, it } from 'vitest';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyReviewLogRecordsWithDbPort, type ReviewLogRecordInput } from '../../lib/core/sync/syncReviewLogApply.js';

import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

function review(index: number, host = 'source'): ReviewLogRecordInput {
  const identity = String(index).padStart(4, '0');
  return { id: `review-${identity}`, op_id: `op-${identity}`, host_name: host, node_id: 'topic', grade: 3,
    scheduler_version: 'fsrs', reviewed_at: '2026-09-30T00:00:00.000Z', due_before: '2026-10-01T00:00:00.000Z',
    stability_before: 1, difficulty_before: 2, due_after: '2026-10-02T00:00:00.000Z',
    stability_after: 3, difficulty_after: 4 };
}

function rows(peer: RestorePeer) {
  return peer.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all();
}

function durableState(peer: RestorePeer) {
  return ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'review_log',
    'node_version_device_revisions', 'node_version_local_proof_state']
    .map(table => peer.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

async function send(source: RestorePeer, target: RestorePeer) {
  const local = await readRequestSyncInventorySnapshot(source.db);
  const difference = compareFramedSyncInventories({ local, remote: [] })
    .find(value => value.objectType === 'node' && value.globalId === 'topic');
  if (!difference) throw new Error('test_topic_missing');
  await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference);
}

it.each([1200, 3])('preserves every field of %s review events across request replay and reopen', async count => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await applySyncNodesWithDbPort(source.db, [textBranch('original', 'Original body')]);
    const expected = Array.from({ length: count }, (_, index) => review(index, count === 3 ? 'x'.repeat(900 * 1024) : 'source'));
    await applyReviewLogRecordsWithDbPort(source.db, expected);
    await send(source, target);
    target.reopen();
    expect(rows(target)).toEqual(expected);
    await send(source, target);
    target.reopen();
    expect(rows(target)).toEqual(expected);
    expect(rows(source)).toEqual(expected);
  } finally { await fixture.close(); }
});

it.each(['grade', 'id', 'op_id'] as const)('rolls back the whole object for a late review %s conflict', async field => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const original = textBranch('original', 'Original body');
    await applySyncNodesWithDbPort(source.db, [original, textBranch('new-head', 'New body', original)]);
    await applySyncNodesWithDbPort(target.db, [original]);
    await applyReviewLogRecordsWithDbPort(source.db, Array.from({ length: 1200 }, (_, index) => review(index)));
    const conflict = { ...review(1199), [field]: field === 'grade' ? 1 : 'conflicting-identity' };
    await applyReviewLogRecordsWithDbPort(target.db, [conflict]);
    const before = durableState(target);
    await expect(send(source, target)).rejects.toThrow('framed_sync_review_conflict:op-1199');
    target.reopen();
    expect(durableState(target)).toEqual(before);
    expect(rows(target)).toEqual([conflict]);
    expect(rows(source)).toEqual(Array.from({ length: 1200 }, (_, index) => review(index)));
  } finally { await fixture.close(); }
});
