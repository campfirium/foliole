// @vitest-environment node
import { expect, it } from 'vitest';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { restoreFixture, transfer } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { branch, receive } from './syncPackStoredVersionDependencies.testSupport.js';

it('transfers a new version without retransmitting the history already held by its peer', async () => {
  const fixture = await restoreFixture();
  try {
    const source = fixture.peer('source');
    const target = fixture.peer('target');
    const history = [branch('v0', 'original')];
    for (let index = 1; index < 84; index++) history.push(branch(`v${index}`, `body ${index}`, history.at(-1)));
    await applySyncNodesWithDbPort(source.db, history);
    await receive(source, target, history);
    await applySyncNodesWithDbPort(source.db, [branch('next', 'new content', history.at(-1))]);
    const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db),
      remote: await readFramedSyncInventory(target.db) });
    const difference = differences.find(value => value.direction === 'local_to_remote' && value.objectType === 'node');
    if (!difference) throw new Error('missing_node_difference');
    await withRequestSyncFiles(source.host.files, async files => {
      await writeRequestSyncSnapshot(source.db, difference, files);
      const versions = [];
      for await (const fact of files.readFacts()) if (fact.kind === 2) versions.push(fact);
      expect(versions.length).toBeLessThanOrEqual(2);
    });
    await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference);
    target.reopen();
    expect(target.sqlite.prepare("SELECT content FROM nodes WHERE id = 'node-1'").pluck().get()).toBe('new content');
    expect(target.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(85);
    expect(target.sqlite.prepare('SELECT count(*) FROM node_sync_version_parents').pluck().get()).toBe(84);
  } finally { await fixture.close(); }
});
