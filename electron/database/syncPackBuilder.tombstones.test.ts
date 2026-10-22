// @vitest-environment node
import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';

import { restoreFixture, transfer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

it('advertises and transfers a historical permanent deletion without a live node or complete version', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const deletedAt = '2026-08-16T00:00:00.000Z';
    const deleted = { ...textBranch('desktop#deleted', '', undefined, deletedAt), is_tombstone: true };
    deleted.object_id = 'prior-deletion'; deleted.snapshot.id = 'prior-deletion';
    deleted.snapshot.deleted_at = deletedAt; deleted.host_name = 'desktop';
    deleted.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(deleted.snapshot), content: '' });
    await applyRemoteNodeTombstone(source.db, deleted, false);
    const original = source.sqlite.prepare('SELECT * FROM node_sync_tombstones').all();
    expect(source.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual([]);
    for (let replay = 0; replay < 2; replay++) {
      source.reopen();
      const inventory = await readFramedSyncInventory(source.db);
      expect(inventory).toHaveLength(1);
      expect(inventory[0]).toMatchObject({ objectType: 'node', globalId: 'prior-deletion', frontierFactIds: ['desktop#deleted'] });
      const [difference] = compareFramedSyncInventories({ local: inventory, remote: [] });
      await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
        providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference!, false);
      target.reopen();
      expect(target.sqlite.prepare(`SELECT node_id, version_id, parent_version_id, host_name, content_hash, deleted_at, created_at
        FROM node_sync_tombstones`).all()).toEqual([{ node_id: 'prior-deletion', version_id: 'desktop#deleted',
        parent_version_id: null, host_name: 'desktop', content_hash: deleted.content_hash, deleted_at: deletedAt, created_at: deletedAt }]);
      expect(target.sqlite.prepare('SELECT * FROM nodes').all()).toEqual([]);
      expect(target.sqlite.prepare(`SELECT version_id, object_id, host_name, content_hash, body_text, parent_version_id
        FROM node_sync_versions`).all()).toEqual([{ version_id: 'desktop#deleted', object_id: 'prior-deletion',
        host_name: 'desktop', content_hash: deleted.content_hash, body_text: null, parent_version_id: null }]);
      expect(target.sqlite.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual([]);
      expect(source.sqlite.prepare('SELECT * FROM node_sync_tombstones').all()).toEqual(original);
      expect(source.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual([]);
    }
  } finally { await fixture.close(); }
});
