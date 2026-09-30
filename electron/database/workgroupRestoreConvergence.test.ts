// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { applyPage, at, buildPage, database, groupId, nodeIds, restoreId, seedNode,
  seedRestore, sourceId, targetId } from './workgroupRestoreIntegration.fixture.js';

let root = '';
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-t266-converge-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

for (const receiver of ['desktop', 'companion'] as const) {
  it(`${receiver} rolls back the entire replacement when the last page fails and then retries`, async () => {
    const source = database(sourceId);
    const target = database(targetId);
    try {
      seedNode(source, 'first', 1);
      seedNode(source, 'second', 2);
      seedNode(target, 'queued-old');
      seedRestore(source, at);
      seedRestore(target, null);
      const first = await buildPage(source, root, 0, 1);
      const last = await buildPage(source, root, 1);
      await applyPage(receiver, target, 0, first);
      target.exec(`CREATE TRIGGER fail_restore BEFORE INSERT ON nodes
        WHEN NEW.id = 'second' BEGIN SELECT RAISE(ABORT, 'restore_write_failed'); END`);
      await expect(applyPage(receiver, target, 1, last)).rejects.toThrow('restore_write_failed');
      expect(nodeIds(target)).toEqual(['queued-old']);
      expect(target.prepare('SELECT applied_at FROM sync_group_restore_events').get())
        .toEqual({ applied_at: null });
      expect(target.prepare('SELECT cursor_state_seq FROM sync_pack_receive_progress').get())
        .toEqual({ cursor_state_seq: 1 });
      target.exec('DROP TRIGGER fail_restore');
      await applyPage(receiver, target, 1, last);
      expect(nodeIds(target)).toEqual(['first', 'second']);
    } finally { source.close(); target.close(); }
  });

  it(`${receiver} adopts a later offline restore even while an older restore is incomplete`, async () => {
    const earlier = database(sourceId);
    const later = database(sourceId);
    const target = database(targetId);
    try {
      seedNode(earlier, 'earlier-first', 1);
      seedNode(earlier, 'earlier-last', 2);
      seedNode(later, 'later-backup');
      seedNode(target, 'queued-old');
      seedRestore(earlier, at);
      seedRestore(target, null);
      const laterId = 'restore-newest';
      const laterAt = '2026-09-27T12:00:01.000Z';
      seedRestore(later, laterAt, laterId, laterAt);
      await applyPage(receiver, target, 0, await buildPage(earlier, root, 0, 1));
      await receiveSyncGroupRestoreEvent(createBetterSqliteDbPort(target), {
        group_id: groupId, restore_id: laterId, restored_at: laterAt,
        source_device_identity_key: sourceId });
      await expect(applyPage(receiver, target, 1, await buildPage(earlier, root, 1)))
        .rejects.toThrow('sync_group_restore_superseded');
      expect(nodeIds(target)).toEqual(['queued-old']);
      await applyPage(receiver, target, 0, await buildPage(later, root, 0, undefined, laterId), laterId);
      expect(nodeIds(target)).toEqual(['later-backup']);
      await receiveSyncGroupRestoreEvent(createBetterSqliteDbPort(target), {
        group_id: groupId, restore_id: restoreId, restored_at: at,
        source_device_identity_key: sourceId });
      expect(nodeIds(target)).toEqual(['later-backup']);
    } finally { earlier.close(); later.close(); target.close(); }
  });

  it(`${receiver} preserves receiver credentials and host settings and retires old queued facts`, async () => {
    const source = database(sourceId);
    const target = database(targetId);
    try {
      seedNode(source, 'chosen-backup');
      seedNode(target, 'queued-old');
      seedRestore(source, at);
      seedRestore(target, null);
      target.prepare(`INSERT INTO setting_records
        (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
        VALUES ('host_preference', 'host', 'windows', 'desktop', 'B', 'true', 'hash', ?)`)
        .run(at);
      target.prepare("INSERT INTO settings VALUES ('host_preference', 'true', ?)").run(at);
      const identity = target.prepare('SELECT * FROM sync_group_local_state').get();
      await applyPage(receiver, target, 0, await buildPage(source, root, 0));
      expect(target.prepare('SELECT * FROM sync_group_local_state').get()).toEqual(identity);
      expect(target.prepare('SELECT workgroup_key FROM sync_groups').get()).toEqual({ workgroup_key: 'secret' });
      expect(target.prepare("SELECT value FROM settings WHERE key = 'host_preference'").get())
        .toEqual({ value: 'true' });
      expect(target.prepare("SELECT value_json FROM setting_records WHERE key = 'host_preference'").get())
        .toEqual({ value_json: 'true' });
      expect(target.prepare("SELECT * FROM sync_object_state WHERE object_id = 'queued-old'").all()).toEqual([]);
      expect(target.prepare("SELECT * FROM node_sync_versions WHERE object_id = 'queued-old'").all()).toEqual([]);
      expect(target.prepare('SELECT * FROM sync_group_restore_page_rows').all()).toEqual([]);
      expect(nodeIds(target)).toEqual(['chosen-backup']);
    } finally { source.close(); target.close(); }
  });
}
