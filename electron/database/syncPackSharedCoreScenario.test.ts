// @vitest-environment node
import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

function version(id: string, title: string, content: string, parent?: NativeSyncNodeRecord) {
  const record = textBranch(id, content, parent);
  record.object_id = 'node-1';
  record.snapshot = { ...record.snapshot, id: 'node-1', title };
  record.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content });
  return record;
}

async function send(source: RestorePeer, target: RestorePeer) {
  const difference = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] })
    .find(value => value.objectType === 'node' && value.globalId === 'node-1');
  if (!difference) throw new Error('test_node_request_missing');
  await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference);
}

it('applies an initial node, repeated request and later version through the shared database surface', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const first = version('desktop#1', 'Packed Article', 'Article body stays in body pack metadata.');
    const second = version('desktop#2', 'Packed Article Updated', 'Updated article body stays in body pack metadata.', first);
    await applySyncNodesWithDbPort(source.db, [first]);
    await send(source, target);
    await send(source, target);
    target.reopen();
    expect(target.sqlite.prepare('SELECT current_version_id, content FROM nodes').all())
      .toEqual([{ current_version_id: first.version_id, content: first.body_text }]);
    await applySyncNodesWithDbPort(source.db, [second]);
    for (let replay = 0; replay < 2; replay++) {
      await send(source, target); target.reopen();
      expect(target.sqlite.prepare('SELECT title, content, body_blob_hash, current_version_id, sync_dirty FROM nodes').all())
        .toEqual([{ title: second.snapshot.title, content: second.body_text, body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
          current_version_id: second.version_id, sync_dirty: 0 }]);
      expect(target.sqlite.prepare("SELECT content_hash, sync_dirty FROM sync_object_state WHERE object_type = 'node'").all())
        .toEqual([{ content_hash: second.content_hash, sync_dirty: 0 }]);
      const columns = 'version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text';
      expect(target.sqlite.prepare(`SELECT ${columns} FROM node_sync_versions ORDER BY version_id`).all())
        .toEqual(source.sqlite.prepare(`SELECT ${columns} FROM node_sync_versions ORDER BY version_id`).all());
      expect(target.sqlite.prepare('SELECT * FROM node_sync_version_parents').all())
        .toEqual([{ version_id: 'desktop#2', parent_version_id: 'desktop#1', ordinal: 0 }]);
    }
  } finally { await fixture.close(); }
});
