// @vitest-environment node
import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { restoreFixture, transfer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

function record(id: string, version: string, parentId: string | null, prior?: NativeSyncNodeRecord): NativeSyncNodeRecord {
  const value = textBranch(version, `Original ${version}中文😀`, prior);
  const result = { ...value, object_id: id, snapshot: { ...value.snapshot, id, parent_id: parentId } };
  result.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(result.snapshot), content: result.body_text! });
  return result;
}

it('fills a stale version body without requiring its deleted structural parent or replacing the current projection', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const oldParent = record('old-parent', 'parent-v1', null);
    const old = record('child', 'child-v1', oldParent.object_id);
    for (const peer of [source, target]) await applySyncNodesWithDbPort(peer.db, [oldParent, old]);
    const newParent = record('new-parent', 'new-parent-v1', null);
    const current = record('child', 'child-v2', newParent.object_id, old);
    await applySyncNodesWithDbPort(target.db, [newParent, current]);
    const deleted = record(oldParent.object_id, 'parent-deleted', null, oldParent);
    deleted.is_tombstone = true;
    deleted.snapshot.deleted_at = '2026-10-13T00:00:00Z';
    deleted.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(deleted.snapshot), content: deleted.body_text! });
    await target.db.transaction(async tx => {
      await upsertRemoteVersion(tx, deleted);
      await applyRemoteNodeTombstone(tx, deleted, false);
    });
    target.sqlite.prepare(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = ?`).run(old.version_id);
    const projection = () => target.sqlite.prepare("SELECT * FROM nodes WHERE id = 'child'").get();
    const before = projection();
    const parents = () => target.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY 1, 2').all();
    const beforeParents = parents();
    const differences = compareFramedSyncDatabaseInventories({ local: await readFramedSyncInventory(source.db),
      remote: await readFramedSyncInventory(target.db) });
    const difference = differences.find(entry => entry.direction === 'local_to_remote' && entry.globalId === 'child');
    expect(difference, 'Current inventory must request the stale source object to exercise this path').toBeDefined();
    if (!difference) throw new Error('test_stale_source_difference_missing');
    await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference);
    target.reopen();
    expect(projection()).toEqual(before);
    expect(parents()).toEqual(beforeParents);
    expect(target.sqlite.prepare("SELECT id FROM nodes WHERE id = 'old-parent'").get()).toBeUndefined();
    expect(target.sqlite.prepare(`SELECT version_id, parent_version_id, content_hash, body_text
      FROM node_sync_versions WHERE version_id = ?`).get(old.version_id)).toEqual({ version_id: old.version_id,
      parent_version_id: old.parent_version_id, content_hash: old.content_hash, body_text: old.body_text });
    expect(target.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally { await fixture.close(); }
});
