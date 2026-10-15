// @vitest-environment node
import { expect, it } from 'vitest';

import { event, prepare, restoreFixture, round, transfer } from '../../../electron/database/requestSyncRestoreRecovery.testSupport.js';
import { compareFramedSyncInventories } from '../../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../../lib/core/sync/framedSyncInventoryRead.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { receiveSyncGroupRestoreEvent } from '../../../lib/core/sync/syncGroupRestoreEvents.js';
import { clearWorkgroupSyncDataForRestore } from '../../../lib/core/sync/syncGroupRestoreReset.js';

it('restores chosen facts, retains local settings, and continues ordinary requests after reopening', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await source.seed('backup-node'); await target.seed('b-only-node');
    target.sqlite.exec(`INSERT INTO setting_records
      (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
      VALUES ('b_only_setting', 'user_space', 'all', 'all', '*', 'true', 'hash', 'now');
      INSERT INTO settings VALUES ('b_only_setting', 'true', 'now');
      INSERT INTO settings VALUES ('search_aliases_document', '[]', 'now')`);
    const progress = await prepare(source, target, 'restore-later');
    expect(target.sqlite.prepare('SELECT library_epoch, proof_revision FROM node_version_local_proof_state').get())
      .toEqual({ library_epoch: 'restore-later', proof_revision: 0 });
    expect((await round(source, target, progress)).complete).toBe(true);
    target.reopen();
    expect(target.sqlite.prepare("SELECT id FROM nodes WHERE id IN ('backup-node', 'b-only-node') ORDER BY id").all())
      .toEqual([{ id: 'backup-node' }]);
    expect(target.sqlite.prepare('SELECT applied_at FROM sync_group_restore_events').get())
      .toMatchObject({ applied_at: expect.any(String) });
    expect(target.sqlite.prepare("SELECT value FROM settings WHERE key = 'b_only_setting'").pluck().get()).toBe('true');
    expect(target.sqlite.prepare("SELECT value_json FROM setting_records WHERE key = 'b_only_setting'").pluck().get()).toBe('true');
    expect(target.sqlite.prepare("SELECT key FROM settings WHERE key = 'search_aliases_document'").get()).toBeUndefined();
    expect(target.sqlite.prepare("SELECT object_id FROM sync_object_state WHERE object_id = 'b-only-node'").get()).toBeUndefined();
    expect(await collectNodeVersionPayloads(target.db, 'backup-node'))
      .toEqual({ released: 0, skipped: null });
    await source.seed('after-restore-node');
    const differences = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db),
      remote: await readRequestSyncInventorySnapshot(target.db) });
    const difference = differences.find(value => value.direction === 'local_to_remote' && value.globalId === 'after-restore-node');
    if (!difference) throw new Error('test_new_node_difference_missing');
    await transfer(source, target, progress, difference);
    const originals = target.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
    await transfer(source, target, progress, difference);
    target.reopen();
    expect(target.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(originals);
    expect(target.sqlite.prepare("SELECT content, current_version_id FROM nodes WHERE id = 'after-restore-node'").get())
      .toEqual(source.sqlite.prepare("SELECT content, current_version_id FROM nodes WHERE id = 'after-restore-node'").get());
  } finally { await fixture.close(); }
});

it('rolls back the reset transaction with original facts and pending restore event intact', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await target.seed('b-only-node');
    await receiveSyncGroupRestoreEvent(target.db, event(source, 'restore-later'));
    const before = ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'sync_group_restore_events']
      .map(table => target.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
    await expect(target.db.transaction(async tx => {
      await clearWorkgroupSyncDataForRestore(tx, 'restore-later');
      throw new Error('replacement_invalid');
    })).rejects.toThrow('replacement_invalid');
    target.reopen();
    expect(['nodes', 'node_sync_versions', 'node_sync_version_parents', 'sync_group_restore_events']
      .map(table => target.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all())).toEqual(before);
    expect(target.sqlite.prepare('SELECT applied_at FROM sync_group_restore_events').get()).toEqual({ applied_at: null });
  } finally { await fixture.close(); }
});
