// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { buildDesktopSyncPackFromDriver } from './syncPackBuilderFromDriver.js';
import { applyPage, at, buildPage, database, groupId, inflatePack, nodeIds, restoreId,
  seedNode, seedRestore, sourceId, targetId } from './workgroupRestoreIntegration.fixture.js';

for (const receiver of ['desktop', 'companion'] as const) {
  it(`${receiver} rejects a delayed ordinary pack from the previous generation after adopting the backup`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-t266-stale-'));
    const oldSource = database(sourceId);
    const restoredSource = database(sourceId);
    const target = database(targetId);
    try {
      seedNode(oldSource, 'old-ordinary');
      const zipPath = path.join(root, 'ordinary.zip');
      await buildDesktopSyncPackFromDriver({ fromPeerId: sourceId, toPeerId: targetId,
        fromStateSeq: 0, outputPath: zipPath, packId: 'old-ordinary-pack' },
      createBetterSqlite3Driver(oldSource));
      const oldPath = path.join(root, 'ordinary.db');
      await fs.writeFile(oldPath, inflatePack(await fs.readFile(zipPath)));
      await applyOrdinary(oldPath, target);
      expect(nodeIds(target)).toEqual(['old-ordinary']);
      seedNode(restoredSource, 'chosen-backup');
      seedRestore(restoredSource, at);
      await receiveSyncGroupRestoreEvent(createBetterSqliteDbPort(target), { group_id: groupId,
        restore_id: restoreId, restored_at: at, source_device_identity_key: sourceId });
      await applyPage(receiver, target, 0, await buildPage(restoredSource, root, 0));
      await expect(applyOrdinary(oldPath, target)).rejects.toThrow('sync_pack_source_epoch_retired');
      expect(nodeIds(target)).toEqual(['chosen-backup']);
    } finally { oldSource.close(); restoredSource.close(); target.close();
      await fs.rm(root, { recursive: true, force: true }); }
  });
}

async function applyOrdinary(packPath: string, db: ReturnType<typeof database>) {
  const port = createBetterSqliteDbPort(db);
  await port.run('ATTACH DATABASE ? AS inc', [packPath]);
  try {
    return await applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0, hostName: 'B', sourceHostName: 'A', sourcePeerId: sourceId });
  } finally { await port.run('DETACH DATABASE inc'); }
}
