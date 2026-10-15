// @vitest-environment node
import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';

import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

async function send(source: RestorePeer, target: RestorePeer) {
  const difference = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db), remote: [] })
    .find(value => value.objectType === 'node' && value.globalId === 'node-delete');
  expect(difference).toBeDefined();
  await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference!, false);
}

it('retains a created article and its subsequent soft deletion through request replay and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target'); const observer = fixture.peer('observer');
  try {
    const created = textBranch('desktop#1', '', undefined, '2026-05-04T08:00:00.000Z');
    created.object_id = 'node-delete'; created.snapshot.id = 'node-delete';
    created.snapshot.title = 'Article To Delete'; created.host_name = 'desktop-source';
    created.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(created.snapshot), content: '' });
    for (const peer of [source, observer]) await applySyncNodesWithDbPort(peer.db, [created]);
    await send(source, target);
    expect(target.sqlite.prepare('SELECT title, current_version_id, deleted_at FROM nodes').get())
      .toEqual({ title: 'Article To Delete', current_version_id: 'desktop#1', deleted_at: null });
    const deletedAt = '2026-05-04T08:05:00.000Z';
    const deleted = textBranch('desktop#delete', '', created, deletedAt);
    deleted.object_id = 'node-delete'; deleted.snapshot.id = 'node-delete';
    deleted.snapshot.title = 'Deleted Article'; deleted.snapshot.deleted_at = deletedAt;
    deleted.host_name = 'desktop-source';
    deleted.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(deleted.snapshot), content: '' });
    await applySyncNodesWithDbPort(source.db, [deleted]);
    expect(await collectNodeVersionPayloads(source.db, 'node-delete')).toEqual({ released: 1, skipped: null });
    const versions = source.sqlite.prepare(`SELECT version_id, object_id, parent_version_id, content_hash, body_text
      FROM node_sync_versions ORDER BY version_id`).all();
    const parents = source.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all();
    for (let replay = 0; replay < 2; replay++) {
      await send(source, target);
      await send(observer, target);
      target.reopen();
      expect(target.sqlite.prepare('SELECT title, current_version_id, deleted_at, sync_dirty FROM nodes').get())
        .toEqual({ title: 'Deleted Article', current_version_id: 'desktop#delete', deleted_at: deletedAt, sync_dirty: 0 });
      expect(target.sqlite.prepare(`SELECT current_version_id, content_hash, deleted_at, sync_dirty FROM sync_object_state
        WHERE object_type = 'node' AND object_id = 'node-delete'`).get())
        .toEqual({ current_version_id: 'desktop#delete', content_hash: deleted.content_hash, deleted_at: deletedAt, sync_dirty: 0 });
      expect(target.sqlite.prepare(`SELECT version_id, object_id, parent_version_id, content_hash, body_text
        FROM node_sync_versions ORDER BY version_id`).all()).toEqual(versions);
      expect(target.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all()).toEqual(parents);
    }
  } finally { await fixture.close(); }
});
