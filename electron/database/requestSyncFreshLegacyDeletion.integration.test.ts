// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { releaseDeletedNodeBodiesWithPort } from '../../lib/core/database/deletedNodeBodyRelease.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';

import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

const base = textBranch('original', 'Original body中文😀', undefined, '2026-10-01T00:00:00Z');
const deletedAt = '2026-10-02T00:00:00Z';
async function remove(peer: RestorePeer) {
  const deleted = { ...textBranch('deleted', base.body_text!, base, deletedAt), is_tombstone: true };
  deleted.snapshot.deleted_at = deletedAt;
  deleted.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(deleted.snapshot), content: deleted.body_text! });
  await peer.db.transaction(async tx => {
    await applyRemoteNodeTombstone(tx, deleted, false);
  });
  return deleted;
}

async function send(source: RestorePeer, target: RestorePeer, search = true) {
  const [difference] = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db), remote: [] });
  if (!difference) throw new Error('test_tombstone_difference_missing');
  await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference, search);
}


it('receives a fresh legacy deletion and its history without rewriting the retired versions', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const draft = textBranch('draft', 'Retired draft', base, '2026-10-01T03:00:00Z');
    await applySyncNodesWithDbPort(source.db, [base, draft]);
    await remove(source);
    source.sqlite.exec(`UPDATE node_sync_tombstones SET snapshot_json =
      json_remove(snapshot_json, '$.compact_version_history') WHERE node_id = 'topic'`);
    await source.db.transaction(tx => releaseDeletedNodeBodiesWithPort(tx, 'topic'));
    const statements: string[] = [];
    target.sqlite.close();
    target.sqlite = new Database(target.file, { verbose: sql => statements.push(String(sql)) });
    await send(source, target, false);
    expect(statements.filter(sql => /\bUPDATE node_sync_versions SET body_text = NULL, snapshot_json =/iu.test(sql)))
      .toHaveLength(0);
    target.reopen();
    expect(target.sqlite.prepare(`SELECT version_id, parent_version_id FROM node_sync_versions
      WHERE body_text IS NULL AND json_type(snapshot_json, '$.deleted_version_metadata_digest') = 'text'
      ORDER BY version_id`).all()).toEqual([
      { version_id: 'draft', parent_version_id: 'original' }, { version_id: 'original', parent_version_id: null }
    ]);
    expect(target.sqlite.prepare("SELECT version_id FROM node_sync_tombstones WHERE node_id='topic'").pluck().get()).toBe('deleted');
    expect(target.sqlite.prepare("SELECT count(*) FROM nodes WHERE id='topic'").pluck().get()).toBe(0);
  } finally { await fixture.close(); }
});
