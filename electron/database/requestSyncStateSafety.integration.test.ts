// @vitest-environment node
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

const now = '2026-10-13T00:00:00.000Z';
async function send(source: RestorePeer, target: RestorePeer) {
  const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db), remote: [] });
  for (const difference of differences) await transfer(source, target, {
    groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch
  }, difference);
  return differences;
}
function tombstone(peer: RestorePeer, type: 'attachment' | 'node_reading', id: string) {
  peer.sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
    VALUES (?, ?, (SELECT high_water + 1 FROM sync_state_sequence), ?, ?, ?, ?, 1)`)
    .run(type, id, computeSyncContentHash(type, buildCanonicalSyncTombstone(id)), peer.id, now, now);
}
async function setting(peer: RestorePeer, key: string, value: string) {
  const payload = { key, scope: 'user_space', platform: 'mac', form_factor: 'desktop', host_name: '*', value_json: value };
  await peer.db.transaction(db => applySyncObjectInTransaction(db, {
    object_type: 'setting', object_id: `user_space:mac:desktop:*:${key}`,
    content_hash: computeSyncContentHash('setting', payload), payload_json: JSON.stringify(payload), updated_at: now, deleted_at: null
  }));
}

it('does not publish a retired attachment tombstone or delete the receiver existing PDF page text', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  const hash = 'a'.repeat(64);
  try {
    target.sqlite.prepare('INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height) VALUES (?, 3, ?, 612, 792)')
      .run(hash, 'Original complete PDF page');
    const original = target.sqlite.prepare('SELECT * FROM pdf_page_text').all();
    tombstone(source, 'attachment', hash);
    expect(await send(source, target)).toEqual([]);
    target.reopen();
    expect(target.sqlite.prepare('SELECT * FROM pdf_page_text').all()).toEqual(original);
    expect(target.sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type = 'attachment'").all()).toEqual([]);
    expect(source.sqlite.prepare("SELECT deleted_at FROM sync_object_state WHERE object_type = 'attachment'").pluck().get()).toBe(now);
  } finally { await fixture.close(); }
});

it('rolls back a state object when its next sequence is occupied without replacing unrelated state', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await setting(source, 'review_scheduler_settings', '{"marker":"incoming"}');
    await setting(target, 'search_aliases_document', '{"aliases":["keep"]}');
    const occupied = Number(target.sqlite.prepare('SELECT MAX(state_seq) FROM sync_object_state').pluck().get());
    target.sqlite.prepare('UPDATE sync_state_sequence SET high_water = ?').run(occupied - 1);
    const tables = ['setting_records', 'sync_object_state', 'sync_state_sequence'];
    const saved = () => tables.map(table => target.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = saved();
    await expect(send(source, target)).rejects.toThrow('UNIQUE constraint failed: sync_object_state.state_seq');
    target.reopen();
    expect(saved()).toEqual(before);
    expect(target.sqlite.prepare("SELECT value_json FROM setting_records WHERE key = 'review_scheduler_settings'").get()).toBeUndefined();
    target.sqlite.prepare('UPDATE sync_state_sequence SET high_water = ?').run(occupied);
    await send(source, target);
    target.reopen();
    expect(target.sqlite.prepare('SELECT key, value_json FROM setting_records ORDER BY key').all()).toEqual([
      { key: 'review_scheduler_settings', value_json: '{"marker":"incoming"}' },
      { key: 'search_aliases_document', value_json: '{"aliases":["keep"]}' }
    ]);
  } finally { await fixture.close(); }
});

it('applies a remote reading tombstone by clearing that node reading and host positions while preserving other progress', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await target.seed('deleted-reading'); await target.seed('unrelated');
    for (const id of ['deleted-reading', 'unrelated']) {
      target.sqlite.prepare("INSERT INTO node_reading (node_id, last_handled_at, next_at, state) VALUES (?, 'before', 'later', 'active')").run(id);
      for (const host of ['Phone', 'Desktop']) target.sqlite.prepare('INSERT INTO node_reading_host_state VALUES (?, ?, 128, ?)')
        .run(id, host, 'before');
    }
    const versions = target.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
    const otherReading = target.sqlite.prepare("SELECT * FROM node_reading WHERE node_id = 'unrelated'").all();
    const otherPositions = target.sqlite.prepare("SELECT * FROM node_reading_host_state WHERE node_id = 'unrelated' ORDER BY host_name").all();
    tombstone(source, 'node_reading', 'deleted-reading');
    for (let replay = 0; replay < 2; replay++) {
      await send(source, target); target.reopen();
      expect(target.sqlite.prepare("SELECT * FROM node_reading WHERE node_id = 'deleted-reading'").all()).toEqual([]);
      expect(target.sqlite.prepare("SELECT * FROM node_reading_host_state WHERE node_id = 'deleted-reading'").all()).toEqual([]);
      expect(target.sqlite.prepare("SELECT * FROM node_reading WHERE node_id = 'unrelated'").all()).toEqual(otherReading);
      expect(target.sqlite.prepare("SELECT * FROM node_reading_host_state WHERE node_id = 'unrelated' ORDER BY host_name").all()).toEqual(otherPositions);
      expect(target.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
      expect(target.sqlite.prepare("SELECT deleted_at FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'deleted-reading'")
        .pluck().get()).toBe(now);
    }
  } finally { await fixture.close(); }
});

it('retains newer live reading state when an older ownerless tombstone is replayed', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await target.seed('reading');
    const payload = { node_id: 'reading', interval_duration_ms: 120000, interval_growth_factor: 1.5,
      last_handled_at: now, next_at: '2026-10-20T00:00:00.000Z', priority: 0.75, repetition_count: 2, state: 'active' };
    await target.db.transaction(db => applySyncObjectInTransaction(db, {
      object_type: 'node_reading', object_id: 'reading', content_hash: computeSyncContentHash('node_reading', payload),
      payload_json: JSON.stringify(payload), updated_at: '2026-10-18T00:00:00.000Z', deleted_at: null
    }));
    target.sqlite.prepare('INSERT INTO node_reading_host_state VALUES (?, ?, 128, ?)').run('reading', 'Phone', now);
    const tables = ['node_reading', 'node_reading_host_state', 'node_sync_versions', 'sync_object_state'];
    const saved = () => tables.map(table => target.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = saved();
    tombstone(source, 'node_reading', 'reading');
    for (let replay = 0; replay < 2; replay++) {
      await send(source, target); target.reopen();
      expect(saved()).toEqual(before);
    }
  } finally { await fixture.close(); }
});
