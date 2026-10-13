// @vitest-environment node
import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';

import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

async function round(source: RestorePeer, target: RestorePeer, errors: string[] = []) {
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
            errors.push(`${difference.direction}:${difference.globalId}:${error}`);
        }
        results.push({ requestId: new Uint8Array(16), objectType: difference.objectType, globalId: difference.globalId, error });
      }
      return results;
    }, reportObjectError: (_difference, error) => { throw error; }
  });
}

it('receives an already deleted family into an empty receiver and retains original facts after reopen', async () => {
  const childCount = 1;
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const records = ['a-parent', ...Array.from({ length: childCount }, (_, i) => `z-child-${i}`)].map(id => {
      const value = textBranch(`${id}-base`, `Original ${id}😀`);
      return { ...value, object_id: id, snapshot: { ...value.snapshot, id, parent_id: id.startsWith('z-child') ? 'a-parent' : null } };
    });
    for (const peer of [source]) {
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
    const errors: string[] = [];
    const result = await round(source, target, errors);
    expect(result, JSON.stringify(errors)).toMatchObject({ complete: true, pending: 0 });
    expect(await round(source, target)).toMatchObject({ complete: true, pending: 0 });
    target.reopen();
    expect(target.sqlite.prepare("SELECT id FROM nodes WHERE id = 'a-parent' OR id LIKE 'z-child-%'").all()).toEqual([]);
    const receivedFacts = tombstones(target);
    expect(receivedFacts.map(fact => Object.fromEntries(Object.entries(fact).filter(([key]) => key !== 'snapshot_json'))))
      .toEqual(originalFacts.map(fact => Object.fromEntries(Object.entries(fact).filter(([key]) => key !== 'snapshot_json'))));
    for (const [index, fact] of receivedFacts.entries()) {
      expect(JSON.parse(fact.snapshot_json)).toMatchObject(JSON.parse(originalFacts[index]!.snapshot_json));
    }
    expect(tombstones(source)).toEqual(originalFacts);
    expect(target.sqlite.prepare('SELECT version_id, parent_version_id, content_hash, body_text FROM node_sync_versions ORDER BY version_id').all())
      .toEqual(source.sqlite.prepare('SELECT version_id, parent_version_id, content_hash, body_text FROM node_sync_versions ORDER BY version_id').all());
    expect(target.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(target.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally { await fixture.close(); }
});
