// @vitest-environment node
import { expect, it } from 'vitest';

import { releaseDeletedNodeBodiesWithPort } from '../../lib/core/database/deletedNodeBodyRelease.js';
import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { projectFramedSyncNodeIdentityFact } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadRetainedSyncNodeVersionFact } from '../../lib/core/sync/syncNodeGraph.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { context, restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
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


it('compacts on a real local delete and retains the deletion through two forwards', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target'); const observer = fixture.peer('observer');
  try {
    await applySyncNodesWithDbPort(source.db, [base, textBranch('head', 'Second draft', base, '2026-10-01T05:00:00Z')]);
    const versionsBefore = source.sqlite.prepare("SELECT version_id, parent_version_id, content_hash FROM node_sync_versions WHERE object_id='topic' ORDER BY version_id").all();
    source.sqlite.exec("ATTACH DATABASE ':memory:' AS search");
    deleteNodesPermanently(createBetterSqlite3Driver(source.sqlite), { nodeIds: ['topic'], deletedAt });
    expect(source.sqlite.prepare("SELECT version_id, parent_version_id, content_hash FROM node_sync_versions WHERE object_id='topic' ORDER BY version_id").all()).toEqual(versionsBefore);
    await send(source, target);
    target.reopen();
    await send(target, observer);
    observer.reopen();
    for (const peer of [source, target, observer]) {
      expect(peer.sqlite.prepare("SELECT json_type(snapshot_json, '$.deleted_version_metadata_digest') FROM node_sync_versions WHERE version_id='original'").pluck().get()).toBe('text');
      expect(peer.sqlite.prepare("SELECT json_type(snapshot_json, '$.attachments') FROM node_sync_versions WHERE version_id='original'").pluck().get()).toBeNull();
      expect(peer.sqlite.prepare("SELECT count(*) FROM node_sync_tombstones WHERE node_id='topic'").pluck().get()).toBe(1);
      expect(peer.sqlite.prepare("SELECT count(*) FROM nodes WHERE id='topic'").pluck().get()).toBe(0);
    }
  } finally { await fixture.close(); }
});

it('compacts a previously unknown old version on replay without reviving the deleted node', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await applySyncNodesWithDbPort(source.db, [base]);
    await remove(target);
    await send(source, target);
    target.reopen();
    expect(target.sqlite.prepare("SELECT json_type(snapshot_json, '$.deleted_version_metadata_digest') FROM node_sync_versions WHERE version_id='original'").pluck().get()).toBe('text');
    expect(target.sqlite.prepare("SELECT count(*) FROM nodes WHERE id='topic'").pluck().get()).toBe(0);
    expect(target.sqlite.prepare("SELECT version_id FROM node_sync_tombstones WHERE node_id='topic'").pluck().get()).toBe('deleted');
    const before = facts(target);
    await send(source, target);
    expect(facts(target)).toEqual(before);
    source.sqlite.exec(`UPDATE node_sync_versions SET snapshot_json =
      json_set(snapshot_json, '$.position', 71) WHERE version_id = 'original'`);
    await expect(send(source, target)).rejects.toThrow('sync_pack_node_version_immutable_mismatch:original');
    target.reopen();
    expect(facts(target)).toEqual(before);
  } finally { await fixture.close(); }
});


it('retains both ordered merge parents across interrupted delivery, retry, and onward transfer', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target'); const observer = fixture.peer('observer');
  try {
    const fork = textBranch('fork', 'Fork', base, '2026-10-01T01:00:00Z');
    const merge = textBranch('merge', 'Merge', base, '2026-10-01T03:00:00Z');
    merge.parent_version_ids = ['original', 'fork'];
    const head = textBranch('head', 'Final', merge, '2026-10-01T05:00:00Z');
    await applySyncNodesWithDbPort(source.db, [base, fork, merge, head]);
    source.sqlite.exec("ATTACH DATABASE ':memory:' AS search");
    deleteNodesPermanently(createBetterSqlite3Driver(source.sqlite), { nodeIds: ['topic'], deletedAt });
    const [difference] = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db), remote: [] });
    expect(difference).toBeDefined();
    const before = facts(target);
    const abort = new AbortController();
    const interrupted = new Error('test_interrupted_during_body_read');
    await expect(withRequestSyncFiles(source.host.files, async request => {
      const selected = await writeRequestSyncSnapshot(source.db, { ...difference!, direction: 'local_to_remote' }, request);
      return applyRequestSyncObject(target.db, {
        context: context({ groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
          providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }),
        peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
          library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
        objectType: 'node', globalId: 'topic',
        ...(selected.currentVersionId ? { currentVersionId: selected.currentVersionId } : {}),
        requestId: new Uint8Array(16), facts: () => request.readFacts(), signal: abort.signal,
        loadBody: async (_db, blob) => {
          const body = await request.loadBody(blob);
          abort.abort(interrupted);
          return body;
        }
      });
    })).rejects.toThrow(interrupted.message);
    target.reopen();
    expect(facts(target)).toEqual(before);
    await send(source, target);
    target.reopen();
    await send(target, observer);
    observer.reopen();
    for (const peer of [source, target, observer]) {
      const parents = peer.sqlite.prepare("SELECT parent_version_id FROM node_sync_version_parents WHERE version_id='merge' ORDER BY ordinal").pluck().all();
      expect(parents).toEqual(['original', 'fork']);
      expect(peer.sqlite.prepare("SELECT count(*) FROM nodes WHERE id='topic'").pluck().get()).toBe(0);
      expect(peer.sqlite.prepare("SELECT count(*) FROM node_sync_tombstones WHERE node_id='topic'").pluck().get()).toBe(1);
      expect(peer.sqlite.prepare("SELECT json_type(snapshot_json, '$.attachments') FROM node_sync_versions WHERE version_id='merge'").pluck().get()).toBeNull();
    }
  } finally { await fixture.close(); }
});

function deletedVersion(id: string, parent = base, time = deletedAt) {
  const record = { ...textBranch(id, 'Original body中文😀', parent, time), is_tombstone: true };
  record.snapshot.deleted_at = time;
  record.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content: record.body_text! });
  return record;
}

it('uses retained version edges to ignore an older standalone tombstone after compaction', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const older = deletedVersion('older');
    const middle = textBranch('middle', 'Original body中文😀', older, '2026-10-03T00:00:00Z');
    const later = deletedVersion('later', middle, '2026-10-04T00:00:00Z');
    await target.db.transaction(async tx => {
      await upsertRemoteVersion(tx, older);
      await upsertRemoteVersion(tx, middle);
      await applyRemoteNodeTombstone(tx, later, false);
      await releaseDeletedNodeBodiesWithPort(tx, 'topic');
    });
    await applyRemoteNodeTombstone(source.db, older, false);
    const before = facts(target);
    await send(source, target);
    target.reopen();
    expect(facts(target)).toEqual(before);
    expect(target.sqlite.prepare("SELECT version_id FROM node_sync_tombstones WHERE node_id='topic'").pluck().get()).toBe('later');
  } finally { await fixture.close(); }
});

it('rejects a conflicting standalone tombstone with the same version ID without changing the durable deletion', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const original = await remove(target);
    await applyRemoteNodeTombstone(source.db, { ...original, content_hash: 'f'.repeat(64) }, false);
    const before = facts(target);
    await expect(send(source, target)).rejects.toThrow('sync_pack_node_version_immutable_mismatch:deleted');
    target.reopen();
    expect(facts(target)).toEqual(before);
  } finally { await fixture.close(); }
});

it('accepts an old version replay without compacting an existing legacy deletion', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    for (const peer of [source, target]) await applySyncNodesWithDbPort(peer.db, [base]);
    await remove(target);
    target.sqlite.exec(`UPDATE node_sync_tombstones SET snapshot_json =
      json_remove(snapshot_json, '$.compact_version_history') WHERE node_id = 'topic'`);
    await target.db.transaction(tx => releaseDeletedNodeBodiesWithPort(tx, 'topic'));
    const before = facts(target);
    await send(source, target);
    target.reopen();
    expect(facts(target)).toEqual(before);
    expect(target.sqlite.prepare(`SELECT json_type(snapshot_json, '$.attachments')
      FROM node_sync_versions WHERE version_id = 'original'`).pluck().get()).toBe('array');
  } finally { await fixture.close(); }
});

it('rejects a compact version when its object remains live and rolls back the received facts', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    for (const peer of [source, target]) await applySyncNodesWithDbPort(peer.db, [base]);
    await remove(source);
    await source.db.transaction(tx => releaseDeletedNodeBodiesWithPort(tx, 'topic'));
    const compact = await loadRetainedSyncNodeVersionFact(source.db, base.version_id!, false);
    const fact = projectFramedSyncNodeIdentityFact(compact!);
    const before = facts(target);
    await expect(applyRequestSyncObject(target.db, {
      context: context({ groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
        providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }),
      peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
        library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
      objectType: 'node', globalId: 'topic', requestId: new Uint8Array(16),
      facts: async function* () { yield fact; },
      loadBody: async () => { throw new Error('unexpected_compact_body_request'); }
    })).rejects.toThrow('node_version_compact_without_deletion');
    target.reopen();
    expect(facts(target)).toEqual(before);
    expect(target.sqlite.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get()).toBe(base.body_text);
  } finally { await fixture.close(); }
});
