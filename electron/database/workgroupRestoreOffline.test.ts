// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { loadLatestSyncGroupRestoreEvent, receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { syncGroupRestorePeersReady } from '../../lib/platform/syncGroupRestoreContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { applyPage, at, buildPage, database, groupId, nodeIds, observerId, restoreId,
  seedNode, seedRestore, sourceId, targetId } from './workgroupRestoreIntegration.fixture.js';

for (const receiver of ['desktop', 'companion'] as const) {
  it(`${receiver} converges offline concurrent and consecutive restores before allowing ordinary edits`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-t266-offline-'));
    const a = database(sourceId, path.join(root, 'a.db'));
    const b = database(targetId, path.join(root, 'b.db'));
    const c = database(observerId, path.join(root, 'c.db'));
    const newerId = 'restore-second';
    const newerAt = '2026-09-27T12:00:02.000Z';
    const latest = { group_id: groupId, restore_id: newerId, restored_at: newerAt,
      source_device_identity_key: targetId };
    try {
      seedNode(a, 'a-offline-backup');
      seedNode(b, 'b-later-offline-backup');
      seedNode(c, 'c-unsent-old');
      seedRestore(a, at);
      seedRestore(b, newerAt, newerId, newerAt, targetId);
      await receiveSyncGroupRestoreEvent(createBetterSqliteDbPort(b), {
        group_id: groupId, restore_id: restoreId, restored_at: at,
        source_device_identity_key: sourceId });
      for (const [target, localId] of [[a, sourceId], [c, observerId]] as const) {
        const port = createBetterSqliteDbPort(target);
        const pending = await receiveSyncGroupRestoreEvent(port, latest);
        expect(syncGroupRestorePeersReady(pending, { event: latest, applied: true })).toBe(false);
        await applyPage(receiver, target, 0,
          await buildPage(b, root, 0, undefined, newerId, targetId, localId), newerId, targetId);
        expect(nodeIds(target)).toEqual(['b-later-offline-backup']);
        expect(syncGroupRestorePeersReady(await loadLatestSyncGroupRestoreEvent(port, groupId),
          { event: latest, applied: true })).toBe(true);
      }
      const consecutive = { ...latest, restore_id: 'restore-third', restored_at: '2026-09-27T12:00:03.000Z' };
      b.exec('DELETE FROM nodes; DELETE FROM sync_object_state; DELETE FROM node_sync_versions');
      seedNode(b, 'consecutive-backup');
      seedRestore(b, consecutive.restored_at, consecutive.restore_id, consecutive.restored_at, targetId);
      for (const [target, localId] of [[a, sourceId], [c, observerId]] as const) {
        await receiveSyncGroupRestoreEvent(createBetterSqliteDbPort(target), consecutive);
        await applyPage(receiver, target, 0, await buildPage(b, root, 0, undefined,
          consecutive.restore_id, targetId, localId), consecutive.restore_id, targetId);
        expect(nodeIds(target)).toEqual(['consecutive-backup']);
        expect(target.prepare('SELECT source_epoch FROM sync_state_sequence').get())
          .toEqual({ source_epoch: consecutive.restore_id });
      }
    } finally { a.close(); b.close(); c.close(); await fs.rm(root, { recursive: true, force: true }); }
  });
}

it('uses the same stable ID order in persisted and in-memory ties, independent of locale collation', async () => {
  const db = database(targetId);
  try {
    const port = createBetterSqliteDbPort(db);
    const event = { group_id: groupId, restore_id: 'restore-z', restored_at: at,
      source_device_identity_key: sourceId };
    await receiveSyncGroupRestoreEvent(port, event);
    await receiveSyncGroupRestoreEvent(port, { ...event, restore_id: 'restore_Z' });
    expect(await loadLatestSyncGroupRestoreEvent(port, groupId)).toMatchObject({
      event: { restore_id: 'restore_Z' }, applied: false });
  } finally { db.close(); }
});
