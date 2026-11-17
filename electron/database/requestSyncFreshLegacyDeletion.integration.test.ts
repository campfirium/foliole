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


it('receives a fresh legacy deletion without repeatedly publishing the growing history', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const history = [base];
    for (let index = 1; index <= 128; index++) {
      history.push(textBranch(`draft-${index}`, `Retired draft ${index}`, history.at(-1),
        new Date(Date.parse('2026-10-01T03:00:00Z') + index * 1000).toISOString()));
    }
    await applySyncNodesWithDbPort(source.db, history);
    await remove(source);
    source.sqlite.exec(`UPDATE node_sync_tombstones SET snapshot_json =
      json_remove(snapshot_json, '$.compact_version_history') WHERE node_id = 'topic'`);
    await source.db.transaction(tx => releaseDeletedNodeBodiesWithPort(tx, 'topic'));
    const statements: string[] = [];
    target.sqlite.close();
    target.sqlite = new Database(target.file, { verbose: sql => statements.push(String(sql)) });
    target.sqlite.exec(`CREATE TABLE inventory_publications (object_id TEXT NOT NULL);
      CREATE TRIGGER count_topic_inventory AFTER INSERT ON framed_sync_inventory
      WHEN NEW.object_type = 'node' AND NEW.object_id = 'topic' BEGIN
        INSERT INTO inventory_publications VALUES (NEW.object_id);
      END;`);
    target.sqlite.exec(`CREATE TRIGGER refuse_topic_deletion BEFORE INSERT ON node_sync_tombstones
      WHEN NEW.node_id = 'topic' BEGIN SELECT RAISE(ABORT, 'deletion rejected'); END;`);
    await expect(send(source, target, false)).rejects.toThrow('deletion rejected');
    expect(target.sqlite.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id='topic'").pluck().get()).toBe(0);
    expect(target.sqlite.prepare("SELECT count(*) FROM node_sync_version_parents WHERE version_id LIKE 'draft-%'").pluck().get())
      .toBe(0);
    target.sqlite.exec('DROP TRIGGER refuse_topic_deletion');
    await send(source, target, false);
    expect(statements.filter(sql => /\bUPDATE node_sync_versions SET body_text = NULL, snapshot_json =/iu.test(sql)))
      .toHaveLength(0);
    target.reopen();
    expect(target.sqlite.prepare('SELECT count(*) FROM inventory_publications').pluck().get())
      .toBeLessThanOrEqual(4);
    expect(target.sqlite.prepare(`SELECT version_id, parent_version_id FROM node_sync_versions
      WHERE body_text IS NULL AND json_type(snapshot_json, '$.deleted_version_metadata_digest') = 'text'
      ORDER BY version_id`).all()).toEqual(history
      .map(({ version_id, parent_version_id }) => ({ version_id, parent_version_id }))
      .sort((left, right) => left.version_id!.localeCompare(right.version_id!)));
    expect(target.sqlite.prepare(`SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents
      WHERE version_id LIKE 'draft-%' ORDER BY version_id`).all()).toEqual(history.slice(1)
      .map(({ version_id, parent_version_id }) => ({ version_id, parent_version_id, ordinal: 0 }))
      .sort((left, right) => left.version_id!.localeCompare(right.version_id!)));
    expect(target.sqlite.prepare("SELECT version_id FROM node_sync_tombstones WHERE node_id='topic'").pluck().get()).toBe('deleted');
    expect(target.sqlite.prepare("SELECT count(*) FROM nodes WHERE id='topic'").pluck().get()).toBe(0);
  } finally { await fixture.close(); }
});
