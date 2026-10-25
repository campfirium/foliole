// @vitest-environment node

import { expect, it } from 'vitest';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { applyReviewLogRecordsWithDbPort } from '../../lib/core/sync/syncReviewLogApply.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

const reviewedAt = '2026-04-30T01:00:00.000Z';
const review = { node_id: 'node-1', difficulty: 2.11810397, due: '2026-05-03T01:00:00.000Z',
  elapsed_days: 0, lapses: 0, last_review_at: reviewedAt, reps: 1, scheduled_days: 3, stability: 2.3065, state: 2 };
const reviewLog = { host_name: 'android-device',
    grade: 3,
  id: 'review-op-android-1', node_id: 'node-1', op_id: 'op-android-1', reviewed_at: reviewedAt,
  kind: 'review' as const, voids_op_id: null, scheduler_version: 'ts-fsrs@4',   };

function seedNode(peer: RestorePeer, id: string, title: string, content: string, host: string, version: string) {
  const driver = createBetterSqlite3Driver(peer.sqlite);
  bindParentOrderWriter(driver, { deviceAnchor: peer.id, libraryPath: peer.file });
  peer.sqlite.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('host_name', ?, 'now')")
    .run(JSON.stringify(host));
  const at = '2026-04-30T02:00:00.000Z';
  upsertNodeSnapshot(driver, { nodeId: id, title, content, hostName: host, kind: 'topic',
    anchorLink: null, parentNodeId: null, isTitleManual: true, position: null, reveal: null, createdAt: at, updatedAt: at });
  expect(flushNodeSyncVersionWithDriver(driver, id, host, at, version)).toBe(version);
}

async function sendNode(source: RestorePeer, target: RestorePeer, id: string) {
  const local = await readRequestSyncInventorySnapshot(source.db);
  const differences = compareFramedSyncInventories({ local, remote: [] })
    .filter(value => ['node', 'node_review'].includes(value.objectType) && value.globalId === id);
  expect(differences.some(value => value.objectType === 'node')).toBe(true);
  for (const difference of differences) await transfer(source, target, {
    groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference);
}

function expectReview(peer: RestorePeer) {
  expect(peer.sqlite.prepare(`SELECT node_id, difficulty, due, elapsed_days, lapses, last_review_at,
    reps, scheduled_days, stability, state FROM node_review WHERE node_id = 'node-1'`).get()).toEqual(review);
  expect(peer.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual([reviewLog]);
  expect(peer.sqlite.prepare(`SELECT object_type, object_id, last_modified_by_host_name, content_hash
    FROM sync_object_state WHERE object_type = 'node_review' AND object_id = 'node-1'`).get()).toEqual({
    object_type: 'node_review', object_id: 'node-1', last_modified_by_host_name: 'android-device',
    content_hash: computeSyncContentHash('node_review', review)
  });
  expect(peer.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'node-1'").pluck().get())
    .toBe('desktop#node-1');
}

it('preserves Android review state and immutable events through bidirectional requests, replay and reopen', async () => {
  const fixture = await restoreFixture();
  const desktop = fixture.peer('source'); const android = fixture.peer('target');
  try {
    seedNode(desktop, 'node-1', 'Review Topic', '', 'desktop', 'desktop#node-1');
    await sendNode(desktop, android, 'node-1');
    await android.db.transaction(tx => applySyncObjectInTransaction(tx, {
      object_type: 'node_review', object_id: 'node-1', payload_json: JSON.stringify(review),
      content_hash: computeSyncContentHash('node_review', review), updated_at: reviewedAt, deleted_at: null
    }, { hostName: 'android-device' }));
    await applyReviewLogRecordsWithDbPort(android.db, [reviewLog]);
    expectReview(android);
    await sendNode(android, desktop, 'node-1');
    desktop.reopen();
    expectReview(desktop);
    await sendNode(desktop, android, 'node-1');
    await sendNode(android, desktop, 'node-1');
    for (const peer of [desktop, android]) { peer.reopen(); expectReview(peer); }
  } finally { await fixture.close(); }
});

it('preserves the original Android node version through bidirectional requests, replay and reopen', async () => {
  const fixture = await restoreFixture();
  const desktop = fixture.peer('source'); const android = fixture.peer('target');
  try {
    seedNode(android, 'node-android', 'Android topic', 'Android body', 'android-device', 'android-device#1');
    const columns = 'version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text';
    const original = android.sqlite.prepare(`SELECT ${columns} FROM node_sync_versions`).all();
    await sendNode(android, desktop, 'node-android');
    await sendNode(desktop, android, 'node-android');
    await sendNode(android, desktop, 'node-android');
    for (const peer of [desktop, android]) {
      peer.reopen();
      expect(peer.sqlite.prepare('SELECT id, current_version_id, title, content FROM nodes').all()).toEqual([
        { id: 'node-android', current_version_id: 'android-device#1', title: 'Android topic', content: 'Android body' }
      ]);
      expect(peer.sqlite.prepare(`SELECT ${columns} FROM node_sync_versions`).all()).toEqual(original);
      expect(peer.sqlite.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual([]);
      expect(peer.sqlite.prepare(`SELECT object_type, object_id, current_version_id FROM sync_object_state
        WHERE object_type = 'node'`).all()).toEqual([
        { object_type: 'node', object_id: 'node-android', current_version_id: 'android-device#1' }
      ]);
    }
  } finally { await fixture.close(); }
});
