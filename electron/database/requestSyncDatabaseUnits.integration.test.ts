// @vitest-environment node
import { expect, it } from 'vitest';

import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { currentParentOrderHash, currentParentOrderPayload } from '../../lib/core/sync/currentParentOrder.js';
import { applyCurrentParentOrderRecord } from '../../lib/core/sync/currentParentOrderStore.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyReviewLogRecordsWithDbPort } from '../../lib/core/sync/syncReviewLogApply.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

async function send(source: RestorePeer, target: RestorePeer, objectType: string) {
  const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db), remote: [] })
    .filter(value => value.objectType === objectType);
  expect(differences).toHaveLength(2);
  const progress = { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch };
  for (const difference of differences) await transfer(source, target, progress, difference);
}

async function richNode(peer: RestorePeer, id: string) {
  const base = textBranch(`${id}-base`, `${id} body`);
  base.object_id = id; base.snapshot.id = id;
  const head = textBranch(`${id}-next-version`, `${id} updated body`, base, '2026-10-09T01:00:00.000Z');
  head.object_id = id; head.snapshot.id = id;
  await applySyncNodesWithDbPort(peer.db, [base, head]);
  await applyReviewLogRecordsWithDbPort(peer.db, [{ id: `${id}-review`, op_id: `${id}-review-op`,
    host_name: 'sender', node_id: id, grade: 3, scheduler_version: 'fsrs-6', reviewed_at: '2026-10-09T01:00:00.000Z',
    due_before: '2026-10-09T00:00:00.000Z', stability_before: 2.5, difficulty_before: 2.25,
    due_after: '2026-10-10T00:00:00.000Z', stability_after: 4.5, difficulty_after: 3.75 }]);
  saveNodeReadingStateWithSync(createBetterSqlite3Driver(peer.sqlite), { nodeId: id, hostName: 'sender',
    updatedAt: '2026-10-09T01:00:00.000Z', reading: { intervalDurationMs: 1000, intervalGrowthFactor: 2,
      lastHandledAt: '2026-10-09', nextAt: '2026-10-10', priority: 1, readingPosition: 0,
      repetitionCount: 1, state: 'active' } });
}

function business(peer: RestorePeer) {
  return {
    nodes: peer.sqlite.prepare('SELECT id, content, current_version_id FROM nodes ORDER BY id').all(),
    versions: peer.sqlite.prepare<[], { version_id: string; body_text: string | null }>(`SELECT object_id, version_id, content_hash, parent_version_id, body_text,
      json_extract(snapshot_json, '$.body_blob_hash') AS body_hash
      FROM node_sync_versions ORDER BY version_id`).all(),
    parents: peer.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all(),
    reviews: peer.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all(),
    reading: peer.sqlite.prepare(`SELECT node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
      next_at, priority, repetition_count, state FROM node_reading ORDER BY node_id`).all()
  };
}

it('preserves two full node histories with reading and review facts across current request replay and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await richNode(source, 'aaa'); await richNode(source, 'ccc');
    const original = business(source);
    expect(original.nodes).toEqual([
      { id: 'aaa', content: 'aaa updated body', current_version_id: 'aaa-next-version' },
      { id: 'ccc', content: 'ccc updated body', current_version_id: 'ccc-next-version' }
    ]);
    expect(original.versions).toHaveLength(4);
    expect(original.parents).toHaveLength(2);
    expect(original.reviews).toHaveLength(2);
    expect(original.reading).toHaveLength(2);
    original.versions = original.versions.map(row => row.version_id.endsWith('-base') ? { ...row, body_text: null } : row);
    for (let replay = 0; replay < 2; replay++) {
      await send(source, target, 'node');
      target.reopen();
      expect(business(target)).toEqual(original);
    }
  } finally { await fixture.close(); }
});

it('preserves both parent order source identities and child lists through current request replay and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    for (const [parentId, childIds] of [['order-a', ['aaa']], ['order-c', ['ccc']]] as const) {
      await source.seed(parentId);
      const sources = [{ authorId: 'sender', counter: 1, childIds: [...childIds] }];
      await applyCurrentParentOrderRecord(source.db, { object_type: 'parent_child_order', object_id: parentId,
        content_hash: currentParentOrderHash(parentId, sources),
        payload_json: JSON.stringify(currentParentOrderPayload(parentId, sources)), updated_at: 'now', deleted_at: null });
    }
    const rows = (peer: RestorePeer) => peer.sqlite.prepare('SELECT * FROM parent_order_sources ORDER BY parent_id, author_id').all();
    const original = rows(source);
    expect(source.sqlite.prepare('SELECT parent_id, child_ids_json FROM parent_order_sources ORDER BY parent_id').all())
      .toEqual([{ parent_id: 'order-a', child_ids_json: '["aaa"]' }, { parent_id: 'order-c', child_ids_json: '["ccc"]' }]);
    for (let replay = 0; replay < 2; replay++) {
      await send(source, target, 'node');
      target.reopen();
      expect(rows(target)).toEqual(original);
      expect(target.sqlite.prepare('SELECT id FROM nodes ORDER BY id').all())
        .toEqual([{ id: 'order-a' }, { id: 'order-c' }]);
    }
  } finally { await fixture.close(); }
});

it('retains two siblings beneath an existing parent across disk reopen and replay', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const parent = textBranch('parent-version', 'Parent正文');
    parent.object_id = 'parent'; parent.snapshot.id = 'parent';
    await applySyncNodesWithDbPort(source.db, [parent]);
    await applySyncNodesWithDbPort(target.db, [parent]);
    for (const id of ['child-a', 'child-b']) {
      const child = textBranch(`${id}-version`, `Complete ${id}正文😀`);
      child.object_id = id; child.snapshot.id = id; child.snapshot.parent_id = 'parent';
      await applySyncNodesWithDbPort(source.db, [child]);
    }
    const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db),
      remote: await readFramedSyncInventory(target.db) }).filter(value => value.objectType === 'node');
    expect(differences.map(value => value.globalId)).toEqual(['child-a', 'child-b']);
    const progress = { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch };
    for (let replay = 0; replay < 2; replay++) {
      for (const difference of differences) await transfer(source, target, progress, difference);
      target.reopen();
      expect(target.sqlite.prepare(`SELECT id, parent_id, content, current_version_id
        FROM nodes WHERE id LIKE 'child-%' ORDER BY id`).all()).toEqual(['child-a', 'child-b'].map(id => ({
        id, parent_id: 'parent', content: `Complete ${id}正文😀`, current_version_id: `${id}-version`
      })));
      expect(target.sqlite.prepare('SELECT object_id, version_id, content_hash, body_text FROM node_sync_versions ORDER BY object_id').all())
        .toEqual(source.sqlite.prepare('SELECT object_id, version_id, content_hash, body_text FROM node_sync_versions ORDER BY object_id').all());
      expect(target.sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions').pluck().get()).toBe(3);
    }
  } finally { await fixture.close(); }
});
