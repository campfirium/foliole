// @vitest-environment node
import { expect, it } from 'vitest';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { loadSyncGroupOverwriteProgress } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { loadLatestSyncGroupRestoreEvent, receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { syncGroupRestorePeersReady } from '../../lib/platform/syncGroupRestoreContract.js';

import { event, ids, originals, prepare, restoreFixture, round, time, transfer,
  type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

function expectFacts(target: RestorePeer, source: RestorePeer) {
  const fields = `version_id, object_id, content_hash, body_text, parent_version_id,
    json_extract(snapshot_json, '$.body_blob_hash') AS body_hash`;
  expect(target.sqlite.prepare(`SELECT ${fields} FROM node_sync_versions ORDER BY version_id`).all())
    .toEqual(source.sqlite.prepare<[], { version_id: string; body_text: string | null }>(
      `SELECT ${fields} FROM node_sync_versions ORDER BY version_id`).all()
      .map(row => row.version_id.endsWith('-base') ? { ...row, body_text: null } : row));
  expect(target.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all())
    .toEqual(source.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all());
  expect(target.sqlite.prepare("SELECT id, content FROM nodes WHERE id NOT LIKE 'special-%' ORDER BY id").all())
    .toEqual(source.sqlite.prepare("SELECT id, content FROM nodes WHERE id NOT LIKE 'special-%' ORDER BY id").all());
}

it('resumes committed restore objects after reopening, retaining credentials and host settings', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await source.seed('first'); await source.seed('second'); await target.seed('queued-old');
    target.sqlite.exec(`INSERT INTO setting_records
      (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
      VALUES ('host_preference', 'host', 'windows', 'desktop', 'B', 'true', 'hash', 'now');
      INSERT INTO settings VALUES ('host_preference', 'true', 'now')`);
    const identity = target.sqlite.prepare('SELECT * FROM sync_group_local_state').get();
    const progress = await prepare(source, target, 'restore-first');
    await expect(round(source, target, progress, () => { throw new Error('connection_lost'); }))
      .rejects.toThrow('connection_lost');
    const partial = originals(target);
    expect(ids(target)).toHaveLength(1);
    expect(await readRequestSyncInventorySnapshot(target.db)).toEqual([]);
    source.reopen(); target.reopen();
    expect(originals(target)).toEqual(partial);
    expect(await loadSyncGroupOverwriteProgress(target.db)).toEqual(progress);
    expect((await round(source, target, progress)).complete).toBe(true);
    expectFacts(target, source);
    expect((await loadLatestSyncGroupRestoreEvent(target.db, 'group'))?.applied).toBe(true);
    expect(await loadSyncGroupOverwriteProgress(target.db)).toBeNull();
    target.reopen(); expectFacts(target, source);
    expect(target.sqlite.prepare('SELECT * FROM sync_group_local_state').get()).toEqual(identity);
    expect(target.sqlite.prepare('SELECT workgroup_key FROM sync_groups').pluck().get()).toBe('secret');
    expect(target.sqlite.prepare("SELECT value FROM settings WHERE key = 'host_preference'").pluck().get()).toBe('true');
    expect(target.sqlite.prepare("SELECT value_json FROM setting_records WHERE key = 'host_preference'").pluck().get()).toBe('true');
    expect(target.sqlite.prepare("SELECT * FROM sync_object_state WHERE object_id = 'queued-old'").all()).toEqual([]);
    expect(target.sqlite.prepare("SELECT * FROM node_sync_versions WHERE object_id = 'queued-old'").all()).toEqual([]);
  } finally { await fixture.close(); }
});

it('retries a failed later object without discarding already committed restore facts', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await source.seed('first'); await source.seed('second');
    const progress = await prepare(source, target, 'restore-first');
    target.sqlite.exec(`CREATE TRIGGER fail_restore BEFORE INSERT ON nodes
      WHEN NEW.id = 'second' BEGIN SELECT RAISE(ABORT, 'restore_write_failed'); END`);
    await expect(round(source, target, progress)).rejects.toThrow('restore_write_failed');
    expect(ids(target)).toEqual([{ id: 'first' }]);
    expect(await readRequestSyncInventorySnapshot(target.db)).toEqual([]);
    expect((await loadLatestSyncGroupRestoreEvent(target.db, 'group'))?.applied).toBe(false);
    target.reopen(); target.sqlite.exec('DROP TRIGGER fail_restore');
    expect((await round(source, target, progress)).complete).toBe(true);
    expectFacts(target, source);
  } finally { await fixture.close(); }
});

it('supersedes an incomplete restore and converges offline peers through consecutive restores', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target'); const observer = fixture.peer('observer');
  try {
    await source.seed('earlier'); await source.seed('earlier-last'); await target.seed('later-backup');
    const older = await prepare(source, observer, 'restore-first');
    await expect(round(source, observer, older, () => { throw new Error('interrupted'); })).rejects.toThrow('interrupted');
    const newerAt = '2026-09-27T12:00:02.000Z';
    const latest = event(target, 'restore-second', newerAt);
    await receiveSyncGroupRestoreEvent(observer.db, latest);
    await expect(round(source, observer, older)).rejects.toThrow('framed_sync_restore_state_invalid');
    for (const receiver of [source, observer]) {
      const progress = await prepare(target, receiver, latest.restore_id, newerAt);
      expect(syncGroupRestorePeersReady(await loadLatestSyncGroupRestoreEvent(receiver.db, 'group'),
        { event: latest, applied: true })).toBe(false);
      expect((await round(target, receiver, progress)).complete).toBe(true);
      expectFacts(receiver, target);
      expect(syncGroupRestorePeersReady(await loadLatestSyncGroupRestoreEvent(receiver.db, 'group'),
        { event: latest, applied: true })).toBe(true);
      await receiveSyncGroupRestoreEvent(receiver.db, event(source, 'restore-first'));
      expectFacts(receiver, target);
    }
    await target.seed('consecutive');
    for (const receiver of [source, observer]) {
      const progress = await prepare(target, receiver, 'restore-third', '2026-09-27T12:00:03.000Z');
      expect((await round(target, receiver, progress)).complete).toBe(true);
      receiver.reopen(); expectFacts(receiver, target);
      expect(receiver.sqlite.prepare('SELECT source_epoch FROM sync_state_sequence').pluck().get()).toBe('restore-third');
    }
  } finally { await fixture.close(); }
});

it('rejects delayed request facts from a previous peer epoch after restore', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await source.seed('chosen-backup');
    const previousEpoch = source.epoch;
    source.sqlite.prepare('UPDATE node_version_local_proof_state SET library_epoch = ?').run('restored-source-epoch');
    const progress = await prepare(source, target, 'restore-first');
    expect((await round(source, target, progress)).complete).toBe(true);
    const before = originals(target);
    const [difference] = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] });
    if (!difference) throw new Error('restore_difference_missing');
    await expect(transfer(source, target, { ...progress, providerLibraryEpoch: previousEpoch }, difference))
      .rejects.toThrow('node_version_peer_restore_requires_rejoin');
    expect(originals(target)).toEqual(before);
  } finally { await fixture.close(); }
});

it('uses stable restore ID tie ordering independent of locale after reopening', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    for (const id of ['restore-z', 'restore_Z']) await receiveSyncGroupRestoreEvent(target.db, event(source, id, time));
    target.reopen();
    expect(await loadLatestSyncGroupRestoreEvent(target.db, 'group'))
      .toMatchObject({ event: { restore_id: 'restore_Z' }, applied: false });
  } finally { await fixture.close(); }
});
