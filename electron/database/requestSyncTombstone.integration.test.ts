// @vitest-environment node
import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';

import { context, restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

const base = textBranch('original', 'Original body中文😀', undefined, '2026-10-01T00:00:00Z');
const deletedAt = '2026-10-02T00:00:00Z';
async function remove(peer: RestorePeer, standalone = false) {
  const deleted = { ...textBranch('deleted', base.body_text!, base, deletedAt), is_tombstone: true };
  deleted.snapshot.deleted_at = deletedAt;
  deleted.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(deleted.snapshot), content: deleted.body_text! });
  await peer.db.transaction(async tx => {
    if (!standalone) await upsertRemoteVersion(tx, deleted);
    await applyRemoteNodeTombstone(tx, deleted, false);
  });
  return deleted;
}
function facts(peer: RestorePeer) {
  return ['node_sync_tombstones', 'node_sync_versions', 'node_sync_version_parents', 'sync_object_state']
    .map(table => peer.sqlite.prepare(`SELECT * FROM ${table}${table === 'sync_object_state' ? " WHERE object_type = 'node'" : ''} ORDER BY 1`).all());
}
async function send(source: RestorePeer, target: RestorePeer, search = true) {
  const [difference] = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db), remote: [] });
  if (!difference) throw new Error('test_tombstone_difference_missing');
  await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference, search);
}

it('does not resurrect a locally deleted node when a peer sends its old active version', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    for (const peer of [source, target]) await applySyncNodesWithDbPort(peer.db, [base]);
    await remove(target);
    expect(await collectNodeVersionPayloads(target.db, 'topic')).toEqual({ released: 1, skipped: null });
    const before = facts(target);
    await send(source, target);
    await send(source, target);
    target.reopen();
    expect(facts(target)).toEqual(before);
    expect(target.sqlite.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
    expect(target.sqlite.prepare("SELECT deleted_at FROM sync_object_state WHERE object_id = 'topic'").get())
      .toEqual({ deleted_at: deletedAt });
  } finally { await fixture.close(); }
});

it.each([false, true])('applies a standalone deletion to an existing node without requiring desktop tables: companion=%s', async companion => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    for (const peer of [source, target]) await applySyncNodesWithDbPort(peer.db, [base]);
    const deleted = await remove(source, true);
    const originals = facts(source);
    if (companion) target.sqlite.exec('DROP TABLE settings; DROP TABLE search_index_invalidations');
    await send(source, target, !companion);
    await send(source, target, !companion);
    target.reopen();
    expect(facts(source)).toEqual(originals);
    expect(target.sqlite.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
    expect(target.sqlite.prepare('SELECT node_id, version_id, parent_version_id, content_hash, deleted_at FROM node_sync_tombstones').all())
      .toEqual([{ node_id: 'topic', version_id: deleted.version_id, parent_version_id: base.version_id,
        content_hash: deleted.content_hash, deleted_at: deletedAt }]);
    expect(target.sqlite.prepare('SELECT version_id, parent_version_id, content_hash, body_text FROM node_sync_versions').all())
      .toEqual([{ version_id: base.version_id, parent_version_id: null, content_hash: base.content_hash, body_text: base.body_text }]);
    expect(target.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally { await fixture.close(); }
});


it.each([false, true])('retains deletion metadata and accepts a complete version whose parent was reclaimed: complete=%s', async complete => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const deleted = { ...textBranch('deleted-missing-parent', 'Original tombstone body', base, deletedAt), is_tombstone: true };
    deleted.snapshot.deleted_at = deletedAt;
    deleted.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(deleted.snapshot), content: deleted.body_text! });
    const before = facts(target);
    if (complete) {
      const projected = projectFramedSyncNodeRecord(deleted);
      await expect(applyRequestSyncObject(target.db, {
        context: context({ groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
          providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }),
        peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
          library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
        objectType: 'node', globalId: 'topic', requestId: new Uint8Array(16),
        facts: async function* () { yield* projected.manifest.facts; }, loadBody: async () => projected.bodyBlob
      })).resolves.toBeDefined();
      target.reopen();
      expect(facts(target)).not.toEqual(before);
      expect(target.sqlite.prepare('SELECT version_id FROM node_sync_versions WHERE version_id = ?').all(base.version_id))
        .toEqual([]);
      expect(target.sqlite.prepare('SELECT count(*) FROM nodes WHERE id = ?').pluck().get('topic')).toBe(0);
    } else {
      await applyRemoteNodeTombstone(source.db, deleted, false);
      const original = source.sqlite.prepare('SELECT * FROM node_sync_tombstones').all();
      await send(source, target);
      await send(source, target);
      target.reopen();
      expect(target.sqlite.prepare('SELECT version_id, parent_version_id, content_hash FROM node_sync_tombstones').all())
        .toEqual([{ version_id: deleted.version_id, parent_version_id: base.version_id, content_hash: deleted.content_hash }]);
      expect(source.sqlite.prepare('SELECT * FROM node_sync_tombstones').all()).toEqual(original);
      expect(target.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual([]);
      expect(target.sqlite.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual([]);
      expect(target.sqlite.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
    }
    expect(target.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally { await fixture.close(); }
});
