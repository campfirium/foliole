// @vitest-environment node
import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { restoreFixture, transfer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

it('retries oversized node metadata after object rollback without changing its original identity or body', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const record = textBranch('large-version', '\ufeff原正文😀\0tail');
    record.snapshot.title = 'T'.repeat(1_048_576);
    record.snapshot.opening_text = 'O'.repeat(1_048_576);
    record.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content: record.body_text! });
    await applySyncNodesWithDbPort(source.db, [record]);
    const [difference] = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db), remote: [] });
    if (!difference) throw new Error('test_large_node_difference_missing');
    const progress = { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch };
    target.sqlite.exec(`CREATE TEMP TRIGGER fail_position BEFORE INSERT ON node_version_member_positions
      BEGIN SELECT RAISE(ABORT, 'position_boundary_failure'); END`);
    await expect(transfer(source, target, progress, difference)).rejects.toThrow('position_boundary_failure');
    expect(target.sqlite.prepare("SELECT * FROM nodes WHERE id = 'topic'").all()).toEqual([]);
    expect(target.sqlite.prepare("SELECT * FROM node_sync_versions WHERE object_id = 'topic'").all()).toEqual([]);
    target.reopen();
    await transfer(source, target, progress, difference);
    await transfer(source, target, progress, difference);
    target.reopen();
    const actual = await loadCurrentSyncNodeRecord(target.db, 'topic');
    expect(actual).toMatchObject({ version_id: record.version_id, content_hash: record.content_hash,
      parent_version_id: null, body_text: record.body_text,
      snapshot: { title: record.snapshot.title, opening_text: record.snapshot.opening_text } });
    expect(target.sqlite.prepare("SELECT COUNT(*) FROM node_sync_versions WHERE object_id = 'topic'").pluck().get()).toBe(1);
  } finally { await fixture.close(); }
});
