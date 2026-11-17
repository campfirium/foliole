// @vitest-environment node
import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

async function round(source: RestorePeer, target: RestorePeer) {
  const progress = { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch };
  return runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: (await readFramedSyncInventory(source.db)).filter(entry => entry.objectType === 'node'),
      remote: (await readFramedSyncInventory(target.db)).filter(entry => entry.objectType === 'node') }),
    transferObjects: async differences => {
      const results = [];
      for (const difference of differences) {
        let error = '';
        try {
          const from = difference.direction === 'local_to_remote' ? source : target;
          const to = difference.direction === 'local_to_remote' ? target : source;
          await transfer(from, to, { ...progress, providerDeviceId: from.id,
            providerLibraryEpoch: from.epoch, receiverDeviceId: to.id, receiverLibraryEpoch: to.epoch }, difference);
        }
        catch (failure) {
          error = failure instanceof Error ? failure.message : String(failure);
        }
        results.push({ requestId: new Uint8Array(16), objectType: difference.objectType, globalId: difference.globalId, error });
      }
      return results;
    }, reportObjectError: (_difference, error) => { throw error; }
  });
}

it.each([1, 2])('receives a parent and %s child deletion facts in one request round and preserves them after reopen', async childCount => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const records = ['a-parent', ...Array.from({ length: childCount }, (_, i) => `z-child-${i}`)].map(id => {
      const value = textBranch(`${id}-base`, `Original ${id}😀`);
      return { ...value, object_id: id, snapshot: { ...value.snapshot, id, parent_id: id.startsWith('z-child') ? 'a-parent' : null } };
    });
    for (const peer of [source, target]) {
      peer.sqlite.pragma('foreign_keys = ON');
      await applySyncNodesWithDbPort(peer.db, records);
    }
    for (const original of [...records].reverse()) {
      const deleted = textBranch(`${original.object_id}-deleted`, original.body_text!, original, '2026-10-13T00:00:00Z');
      const tombstone = { ...deleted, object_id: original.object_id, is_tombstone: true,
        snapshot: { ...deleted.snapshot, id: original.object_id, parent_id: original.snapshot.parent_id,
          deleted_at: '2026-10-13T00:00:00Z' } };
      tombstone.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(tombstone.snapshot), content: tombstone.body_text! });
      await source.db.transaction(async tx => {
        await upsertRemoteVersion(tx, tombstone);
        await applyRemoteNodeTombstone(tx, tombstone, false);
      });
    }
    const tombstones = (peer: typeof source) => peer.sqlite.prepare<[], { snapshot_json: string; [key: string]: unknown }>(
      'SELECT * FROM node_sync_tombstones ORDER BY node_id').all();
    const originalFacts = tombstones(source);
    const result = await round(source, target);
    expect(result).toMatchObject({ complete: true, pending: 0 });
    expect(await round(source, target)).toMatchObject({ complete: true, pending: 0 });
    target.reopen();
    expect(target.sqlite.prepare("SELECT id FROM nodes WHERE id = 'a-parent' OR id LIKE 'z-child-%'").all()).toEqual([]);
    const receivedFacts = tombstones(target);
    expect(receivedFacts.map(fact => Object.fromEntries(Object.entries(fact).filter(([key]) => key !== 'snapshot_json'))))
      .toEqual(originalFacts.map(fact => Object.fromEntries(Object.entries(fact).filter(([key]) => key !== 'snapshot_json'))));
    // The receiver keeps every deletion fact but none of the deleted text or what was taken from it.
    const withoutText = (json: string) => Object.fromEntries(Object.entries(JSON.parse(json) as Record<string, unknown>)
      .filter(([key]) => !['content', 'title', 'opening_text', 'body_deleted', 'body_blob_hash', 'text_alternative_bodies'].includes(key)));
    for (const [index, fact] of receivedFacts.entries()) {
      expect(withoutText(fact.snapshot_json)).toMatchObject(withoutText(originalFacts[index]!.snapshot_json));
      expect(JSON.parse(fact.snapshot_json)).toMatchObject({ content: null, opening_text: null });
    }
    const factsWithoutText = (facts: typeof originalFacts) => facts.map(fact => ({ ...fact, snapshot_json: withoutText(fact.snapshot_json) }));
    expect(factsWithoutText(tombstones(source))).toEqual(factsWithoutText(originalFacts));
    // History identities match; the receiver keeps no text of any deleted version.
    // Deletions themselves are compared as tombstones above; a receiver may hold them only there.
    const identities = `SELECT version_id, parent_version_id, content_hash FROM node_sync_versions
      WHERE version_id NOT IN (SELECT version_id FROM node_sync_tombstones) ORDER BY version_id`;
    expect(target.sqlite.prepare(identities).all()).toEqual(source.sqlite.prepare(identities).all());
    expect(target.sqlite.prepare(`SELECT count(*) FROM node_sync_versions
      WHERE body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text'`).pluck().get()).toBe(0);
    expect(target.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(target.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally { await fixture.close(); }
});


it.each([false, true])('preserves an offline child in Inbox when the child arrives first: %s', async childFirst => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const base = textBranch('parent-base', 'Parent body');
    const parent = { ...base, object_id: 'parent', snapshot: { ...base.snapshot, id: 'parent' } };
    for (const peer of [source, target]) await applySyncNodesWithDbPort(peer.db, [parent]);
    const child = textBranch('child-base', 'Live child body😀');
    await applySyncNodesWithDbPort(target.db, [{ ...child, object_id: 'child',
      snapshot: { ...child.snapshot, id: 'child', parent_id: 'parent' } }]);
    const deleted = textBranch('parent-deleted', parent.body_text!, parent, '2026-10-13T00:00:00Z');
    const tombstone = { ...deleted, object_id: 'parent', is_tombstone: true,
      snapshot: { ...deleted.snapshot, id: 'parent', deleted_at: '2026-10-13T00:00:00Z' } };
    tombstone.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(tombstone.snapshot), content: tombstone.body_text! });
    await source.db.transaction(async tx => {
      await upsertRemoteVersion(tx, tombstone);
      await applyRemoteNodeTombstone(tx, tombstone, false);
    });
    const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db),
      remote: await readFramedSyncInventory(target.db) });
    const difference = differences.find(value => value.direction === 'local_to_remote' && value.globalId === 'parent');
    if (!difference) throw new Error('test_parent_deletion_missing');
    const progress = { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch };
    const childRow = (peer: RestorePeer) => peer.sqlite.prepare(
      "SELECT parent_id, content FROM nodes WHERE id = 'child'").get();
    const inboxChild = { parent_id: INBOX_NODE_ID, content: 'Live child body😀' };
    const publishChild = (peer: RestorePeer) => flushNodeSyncVersionWithDriver(
      createBetterSqlite3Driver(peer.sqlite), 'child', peer.id);
    if (childFirst) {
      const inbound = differences.find(value => value.direction === 'remote_to_local' && value.globalId === 'child');
      if (!inbound) throw new Error('test_child_missing');
      await transfer(target, source, { ...progress, providerDeviceId: target.id, providerLibraryEpoch: target.epoch,
        receiverDeviceId: source.id, receiverLibraryEpoch: source.epoch }, inbound);
      expect(childRow(source)).toEqual(inboxChild);
      expect(publishChild(source)).toBeTruthy();
      expect(await round(source, target)).toMatchObject({ complete: true, pending: 0 });
    } else {
      await transfer(source, target, progress, difference);
      expect(childRow(target)).toEqual(inboxChild);
      expect(publishChild(target)).toBeTruthy();
      expect(await round(source, target)).toMatchObject({ complete: true, pending: 0 });
    }
    for (const peer of [source, target]) {
      peer.reopen();
      expect(childRow(peer)).toEqual(inboxChild);
      expect(peer.sqlite.prepare("SELECT id FROM nodes WHERE id = 'parent'").get()).toBeUndefined();
      expect(peer.sqlite.prepare("SELECT json_extract(snapshot_json, '$.parent_id') FROM node_sync_versions WHERE version_id = 'child-base'")
        .pluck().get()).toBe('parent');
      expect(peer.sqlite.pragma('foreign_key_check')).toEqual([]);
    }
    expect(await round(source, target)).toMatchObject({ complete: true, pending: 0 });
  } finally { await fixture.close(); }
});

it('waits for a missing parent when there is no permanent deletion', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  try {
    const parent = textBranch('future-parent-version', 'Parent');
    const child = textBranch('future-child-version', 'Child');
    await applySyncNodesWithDbPort(source.db, [
      { ...parent, object_id: 'future-parent', snapshot: { ...parent.snapshot, id: 'future-parent' } },
      { ...child, object_id: 'future-child',
        snapshot: { ...child.snapshot, id: 'future-child', parent_id: 'future-parent' } }
    ]);
    const entries = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db), remote: [] });
    const childDifference = entries.find(value => value.globalId === 'future-child')!;
    const progress = { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch };
    await expect(transfer(source, target, progress, childDifference)).rejects
      .toThrow('framed_sync_node_parent_missing:future-parent');
    expect(target.sqlite.prepare('SELECT id FROM nodes WHERE id IN (?, ?)').all('future-child', INBOX_NODE_ID)).toEqual([]);
    expect(await round(source, target)).toMatchObject({ complete: true });
    expect(target.sqlite.prepare('SELECT parent_id FROM nodes WHERE id = ?').pluck().get('future-child')).toBe('future-parent');
  } finally { await fixture.close(); }
});
