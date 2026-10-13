// @vitest-environment node
import path from 'node:path';

import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { reconcileCurrentNodeBody } from '../../lib/core/sync/currentNodeBodyProjection.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { restoreFramedSyncReview } from '../../lib/core/sync/framedSyncRelationReviewFact.js';
import { withRequestSyncFiles, type RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyReviewLogRecordsWithDbPort, type ReviewLogRecordInput } from '../../lib/core/sync/syncReviewLogApply.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { context, restoreFixture, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

async function snapshot(source: RestorePeer, files: ReturnType<typeof createDesktopFramedSyncFiles>,
  consume: (request: RequestSyncFiles) => Promise<void>) {
  const difference = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] })
    .find(value => value.objectType === 'node' && value.globalId === 'topic');
  if (!difference) throw new Error('projection_fixture_difference_missing');
  await withRequestSyncFiles(files, async request => {
    await writeRequestSyncSnapshot(source.db, difference, request);
    await consume(request);
  });
}

function apply(source: RestorePeer, target: RestorePeer, request: RequestSyncFiles) {
  return applyRequestSyncObject(target.db, {
    context: context({ groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }),
    peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
      library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
    objectType: 'node', globalId: 'topic', requestId: new Uint8Array(16), enqueueSearchInvalidations: false,
    facts: () => request.readFacts(), loadBody: (_db, blob) => request.loadBody(blob)
  });
}

function history(peer: RestorePeer) {
  return ['node_sync_versions', 'node_sync_version_parents'].map(table =>
    peer.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

function review(index: number): ReviewLogRecordInput {
  return { id: `review-${index}`, op_id: `op-${index}`, host_name: 'source', node_id: index === 7 ? 'unrelated' : 'topic',
    grade: 3, scheduler_version: 'scheduler', reviewed_at: '2026-10-01', due_before: 'before',
    stability_before: 1, difficulty_before: 2, due_after: 'after', stability_after: 3, difficulty_after: 4 };
}

it('keeps another article and its immutable review facts outside the requested snapshot and receiver', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await source.seed('topic'); await source.seed('unrelated');
    const reviews = Array.from({ length: 8 }, (_, index) => review(index));
    await applyReviewLogRecordsWithDbPort(source.db, reviews);
    const originals = history(source);
    await snapshot(source, source.host.files, async request => {
      const selected: ReviewLogRecordInput[] = [];
      for await (const fact of request.readFacts()) {
        expect(fact.globalId).toBe('topic');
        if (fact.kind === 4) selected.push(restoreFramedSyncReview(fact));
      }
      expect(selected).toEqual(reviews.slice(0, 7));
      await apply(source, target, request); await apply(source, target, request);
    });
    target.reopen();
    expect(target.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(reviews.slice(0, 7));
    expect(target.sqlite.prepare("SELECT id FROM nodes WHERE id = 'unrelated'").all()).toEqual([]);
    expect(target.sqlite.prepare("SELECT version_id FROM node_sync_versions WHERE object_id = 'unrelated'").all()).toEqual([]);
    expect(source.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(reviews);
    expect(history(source)).toEqual(originals);
  } finally { await fixture.close(); }
});

it('spools and applies original bodies using the real desktop FilePort beneath a long native cache path', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const body = '\uFEFFOriginal中😀\0\r\n' + 'x'.repeat(741 * 1024);
    const records = [textBranch('original', body)];
    for (let index = 1; index < 5; index++) records.push(textBranch(`history-${index}`, `${body} ${index}`, records.at(-1)));
    records.push(textBranch('head', `${body} tail`, records.at(-1)));
    await applySyncNodesWithDbPort(source.db, records);
    const original = history(source);
    const cache = path.join(fixture.root, 'group-'.repeat(12), 'peer-'.repeat(12), 'restore-'.repeat(12));
    const files = createDesktopFramedSyncFiles(cache);
    await snapshot(source, files, async request => {
      expect((await files.list('requests')).length).toBeGreaterThan(0);
      await apply(source, target, request);
      target.reopen();
      await apply(source, target, request);
    });
    expect(await files.list('requests')).toEqual([]);
    target.reopen();
    const scalarRows = (peer: RestorePeer) => peer.sqlite.prepare(`SELECT version_id, object_id,
      parent_version_id, host_name, created_at, content_hash, body_text FROM node_sync_versions ORDER BY version_id`).all();
    expect(scalarRows(target)).toEqual(scalarRows(source));
    expect(history(target)[1]).toEqual(original[1]);
    const snapshots = (peer: RestorePeer) => peer.db.query<{ version_id: string; snapshot_json: string }>(
      'SELECT version_id, snapshot_json FROM node_sync_versions ORDER BY version_id');
    const sourceSnapshots = await snapshots(source);
    const targetSnapshots = await snapshots(target);
    expect(targetSnapshots.map(row => row.version_id)).toEqual(sourceSnapshots.map(row => row.version_id));
    for (const [index, row] of sourceSnapshots.entries()) {
      expect(JSON.parse(targetSnapshots[index]!.snapshot_json)).toMatchObject(JSON.parse(row.snapshot_json));
    }
    expect(target.sqlite.prepare("SELECT content, current_version_id FROM nodes WHERE id = 'topic'").get())
      .toEqual({ content: `${body} tail`, current_version_id: 'head' });
    expect(history(source)).toEqual(original);
  } finally { await fixture.close(); }
});

it.each([
  { content: 'local text', dirty: 0, deleted: null, expected: 'local text' },
  { content: '', dirty: 1, deleted: null, expected: '' },
  { content: '', dirty: 0, deleted: '2026-10-02', expected: 'Original body' }
])('preserves the current local projection across full request replay: %j', async state => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const record = textBranch('original', 'Original body');
    if (state.deleted) {
      record.snapshot.deleted_at = state.deleted;
      record.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content: record.body_text! });
    }
    await applySyncNodesWithDbPort(source.db, [record]);
    await snapshot(source, source.host.files, async request => {
      await apply(source, target, request);
      const original = history(target);
      expect(target.sqlite.prepare("SELECT deleted_at FROM nodes WHERE id = 'topic'").pluck().get()).toBe(state.deleted);
      target.sqlite.prepare(`UPDATE nodes SET content = ?, body_blob_hash = NULL, sync_dirty = ?, deleted_at = ?
        WHERE id = 'topic'`).run(state.content, state.dirty, state.deleted);
      for (let replay = 0; replay < 2; replay++) {
        await apply(source, target, request); target.reopen();
        expect(target.sqlite.prepare("SELECT content, current_version_id, deleted_at, sync_dirty FROM nodes WHERE id = 'topic'").get())
          .toEqual({ content: state.expected, current_version_id: 'original', deleted_at: state.deleted, sync_dirty: state.dirty });
        if (!state.deleted) expect(target.sqlite.prepare("SELECT body_blob_hash FROM nodes WHERE id = 'topic'").pluck().get()).toBeNull();
        expect(history(target)).toEqual(original);
      }
    });
  } finally { await fixture.close(); }
});

it('repairs a raw locally deleted projection without changing its deletion or original version', async () => {
  const fixture = await restoreFixture();
  const target = fixture.peer('target');
  try {
    await applySyncNodesWithDbPort(target.db, [textBranch('original', 'Original body')]);
    const original = history(target);
    target.sqlite.exec("UPDATE nodes SET content = '', body_blob_hash = NULL, sync_dirty = 0, deleted_at = '2026-10-02' WHERE id = 'topic'");
    await target.db.transaction(db => reconcileCurrentNodeBody(db, 'topic', false));
    target.reopen();
    expect(target.sqlite.prepare("SELECT content, current_version_id, deleted_at FROM nodes WHERE id = 'topic'").get())
      .toEqual({ content: 'Original body', current_version_id: 'original', deleted_at: '2026-10-02' });
    expect(history(target)).toEqual(original);
  } finally { await fixture.close(); }
});
