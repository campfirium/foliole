// @vitest-environment node
import { expect, it } from 'vitest';

import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
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
    const differences = compareFramedSyncDatabaseInventories({ local: await readFramedSyncInventory(source.db),
      remote: await readFramedSyncInventory(target.db) });
    const difference = differences.find(value => value.direction === 'local_to_remote' && value.objectType === 'node');
    if (!difference) throw new Error('missing_node_difference');
    await withRequestSyncFiles(source.host.files, async files => {
      await writeRequestSyncSnapshot(source.db, difference, files);
      const versions = [];
      for await (const fact of files.readFacts()) if (fact.kind === 2) versions.push(fact);
      expect(versions.map(fact => fact.factId)).toEqual(['next']);
    });
    await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference);
    target.reopen();
    expect(target.sqlite.prepare("SELECT content FROM nodes WHERE id = 'node-1'").pluck().get()).toBe('new content');
    expect(target.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(85);
    expect(target.sqlite.prepare('SELECT count(*) FROM node_sync_version_parents').pluck().get()).toBe(84);
  } finally { await fixture.close(); }
});

it.each(['parent', 'current'])('repairs a missing %s reference without retransmitting known version bodies', async missing => {
  const fixture = await restoreFixture();
  try {
    const source = fixture.peer('source'); const target = fixture.peer('target');
    const root = branch('root', 'Original'); const head = branch('head', 'Complete current body', root);
    await applySyncNodesWithDbPort(source.db, [root, head]);
    await receive(source, target, [root, head]);
    if (missing === 'parent') target.sqlite.exec("DELETE FROM node_sync_version_parents WHERE version_id = 'head'");
    else target.sqlite.exec(`UPDATE nodes SET current_version_id = NULL WHERE id = 'node-1';
      UPDATE sync_object_state SET current_version_id = NULL WHERE object_type = 'node' AND object_id = 'node-1';`);
    const before = target.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
    const difference = compareFramedSyncDatabaseInventories({ local: await readFramedSyncInventory(source.db),
      remote: await readFramedSyncInventory(target.db) }).find(value => value.direction === 'local_to_remote' && value.globalId === 'node-1');
    if (!difference) throw new Error('missing_reference_difference');
    expect(difference.need.frontierFactIds).toEqual([]);
    await withRequestSyncFiles(source.host.files, async files => {
      const selected = await writeRequestSyncSnapshot(source.db, difference, files);
      const facts = [];
      for await (const fact of files.readFacts()) facts.push(fact);
      expect(facts.filter(fact => fact.kind === 2)).toEqual([]);
      expect(facts.flatMap(fact => fact.blobs)).toEqual([]);
      expect(facts).toHaveLength(missing === 'parent' ? 1 : 0);
      expect(selected.currentVersionId).toBe('head');
    });
    await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference);
    target.reopen();
    expect(target.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
    expect(target.sqlite.prepare('SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents').all())
      .toEqual([{ version_id: 'head', parent_version_id: 'root', ordinal: 0 }]);
    expect(target.sqlite.prepare("SELECT current_version_id, content FROM nodes WHERE id = 'node-1'").get())
      .toEqual({ current_version_id: 'head', content: 'Complete current body' });
  } finally { await fixture.close(); }
});
