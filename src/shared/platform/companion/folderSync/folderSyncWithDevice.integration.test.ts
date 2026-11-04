// @vitest-environment node
import { expect, it } from 'vitest';

import { restoreFixture, transfer } from '../../../../../electron/database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../../../../../electron/database/topicTextState.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../../../../electron/sync/desktopFramedSyncFiles.js';
import { loadFolderSyncCheckpoint, readFolderSyncInventory } from '../../../../../lib/core/sync/folderSync/checkpoint.js';
import { inspectStoredObject } from '../../../../../lib/core/sync/folderSync/writeRound.testSupport.js';
import { compareFramedSyncDatabaseInventories } from '../../../../../lib/core/sync/framedSyncDatabaseDifference.js';
import { readRequestSyncInventorySnapshot } from '../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { applyConvergentSyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeConvergence.js';
import { loadCurrentSyncNodeRecord } from '../../../../../lib/core/sync/syncNodeGraph.js';

import { createCadenceFixture, pauseNextObjectWrite } from './folderSyncCadence.testSupport.js';
import { createFolderSyncService } from './folderSyncService.js';

it('lets a device receive current facts while folder output is paused, preserving both persisted results on reopen', async () => {
  const peers = await restoreFixture();
  const folder = await createCadenceFixture(true);
  const source = peers.peer('source');
  const target = peers.peer('target');
  const service = createFolderSyncService(folder.native.plugin, async () => ({ sourceId: source.epoch,
    source: source.host, attachments: folder.input.sourceAttachments, assertCurrent() {} }));
  let release = () => {};
  try {
    await source.seed('topic');
    await service.write();
    const previous = (await loadCurrentSyncNodeRecord(source.db, 'topic'))!;
    await applyConvergentSyncNodesWithDbPort(source.db, [textBranch('coexisting-version', 'Shared edit', previous)]);
    const pause = pauseNextObjectWrite(folder);
    release = pause.release;
    const writing = service.write();
    await pause.started;
    const differences = compareFramedSyncDatabaseInventories({ local: await readRequestSyncInventorySnapshot(source.db),
      remote: await readRequestSyncInventorySnapshot(target.db) });
    for (const difference of differences.filter(item => item.direction === 'local_to_remote')) {
      await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
        providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference, false);
    }
    expect(target.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe('Shared edit');
    release();
    await writing;
    source.reopen();
    target.reopen();
    expect(source.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe('Shared edit');
    expect(target.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe('Shared edit');
    const files = createDesktopFramedSyncFiles(`${folder.root}/destination`);
    const checkpoint = (await loadFolderSyncCheckpoint(files, source.epoch))!;
    expect((await readFolderSyncInventory(files, checkpoint)).find(item => item.globalId === 'topic')!.currentVersionId).toBe('coexisting-version');
    const saved = await inspectStoredObject({ ...folder, input: { ...folder.input, target: { ...folder.input.target, files } } }, checkpoint.objects.at(-1)!);
    expect(saved.bodies).toContain('Shared edit');
  } finally { release(); await service.getActiveRun()?.catch(() => undefined); await folder.close(); await peers.close(); }
});
