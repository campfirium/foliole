// @vitest-environment node
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory, readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

const at = '2026-10-13T00:00:00.000Z';

function orphan(peer: RestorePeer, type: string, id: string, sequence: number) {
  peer.sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    VALUES (?, ?, ?, ?, 'source', ?)`).run(type, id, sequence, 'a'.repeat(64), at);
}

async function send(source: RestorePeer, target: RestorePeer, objectType: string, globalId: string) {
  const local = await readFramedSyncInventory(source.db);
  const difference = compareFramedSyncInventories({ local, remote: [] })
    .find(value => value.objectType === objectType && value.globalId === globalId);
  expect(difference).toBeDefined();
  await withRequestSyncFiles(source.host.files, async files => {
    await writeRequestSyncSnapshot(source.db, difference!, files);
    const identities = [];
    for await (const fact of files.readFacts()) identities.push({ objectType: fact.objectType, globalId: fact.globalId });
    expect(identities.length).toBeGreaterThan(0);
    expect(identities.every(value => value.objectType === objectType && value.globalId === globalId)).toBe(true);
  });
  await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference!, false);
}

it('selects inventory and snapshot by both type and identity when two valid objects share an id', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await source.seed('shared');
    const payload = { source_fingerprint: 'shared', provider: 'manual', source_kind: 'markdown',
      source_name: 'Original.md', source_locator: '', first_imported_at: at, last_imported_at: at,
      last_content_fingerprint: 'original-content', latest_node_id: null };
    await applySyncObjectInTransaction(source.db, { object_type: 'import_source', object_id: 'shared',
      payload_json: JSON.stringify(payload), content_hash: computeSyncContentHash('import_source', payload),
      updated_at: at, deleted_at: null });
    for (const objectType of ['node', 'import_source']) {
      expect(await readFramedSyncInventoryEntry(source.db, { objectType, globalId: 'shared' }))
        .toMatchObject({ objectType, globalId: 'shared' });
    }
    expect(await readFramedSyncInventoryEntry(source.db, { objectType: 'external_document', globalId: 'shared' })).toBeNull();
    await send(source, target, 'import_source', 'shared');
    expect(target.sqlite.prepare('SELECT id FROM nodes').all()).toEqual([]);
    expect(target.sqlite.prepare('SELECT source_fingerprint, source_name FROM import_sources').all())
      .toEqual([{ source_fingerprint: 'shared', source_name: 'Original.md' }]);
    await send(source, target, 'node', 'shared');
    target.reopen();
    expect(target.sqlite.prepare('SELECT id, content FROM nodes').all())
      .toEqual([{ id: 'shared', content: 'Current shared中文\0' }]);
    expect(target.sqlite.prepare('SELECT source_fingerprint, source_name FROM import_sources').all())
      .toEqual([{ source_fingerprint: 'shared', source_name: 'Original.md' }]);
  } finally { await fixture.close(); }
});

it('does not advertise live reading or review state without their backing node and learning entities', async () => {
  const fixture = await restoreFixture(); const source = fixture.peer('source');
  try {
    orphan(source, 'node_reading', 'gone', 7);
    orphan(source, 'node_review', 'gone', 8);
    expect(await readFramedSyncInventory(source.db)).toEqual([]);
    for (const objectType of ['node', 'node_reading', 'node_review']) {
      expect(await readFramedSyncInventoryEntry(source.db, { objectType, globalId: 'gone' })).toBeNull();
    }
    expect(source.sqlite.prepare('SELECT COUNT(*) FROM sync_object_state').pluck().get()).toBe(2);
  } finally { await fixture.close(); }
});

it('omits a state-only live node while retaining recoverable original versions after its projection is lost', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    orphan(source, 'node', 'no-original-facts', 9);
    expect(await readFramedSyncInventory(source.db)).toEqual([]);
    expect(await readFramedSyncInventoryEntry(source.db, { objectType: 'node', globalId: 'no-original-facts' })).toBeNull();
    await source.seed('recoverable');
    const versions = source.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
    const parents = source.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all();
    source.sqlite.prepare("DELETE FROM nodes WHERE id = 'recoverable'").run();
    expect(source.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
    expect(source.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all()).toEqual(parents);
    expect((await readFramedSyncInventory(source.db)).map(value => value.globalId)).toEqual(['recoverable']);
    await send(source, target, 'node', 'recoverable');
    target.reopen();
    expect(target.sqlite.prepare('SELECT id, content FROM nodes').all())
      .toEqual([{ id: 'recoverable', content: 'Current recoverable中文\0' }]);
    expect(target.sqlite.prepare(`SELECT version_id, content_hash, json_extract(snapshot_json, '$.body_blob_hash') AS hash
      FROM node_sync_versions ORDER BY version_id`).all()).toEqual(source.sqlite.prepare(`SELECT version_id, content_hash,
        json_extract(snapshot_json, '$.body_blob_hash') AS hash FROM node_sync_versions ORDER BY version_id`).all());
    expect(target.sqlite.prepare(`SELECT version_id, body_text FROM node_sync_versions
      WHERE body_text IS NOT NULL ORDER BY version_id`).all())
      .toEqual([{ version_id: 'recoverable-head', body_text: 'Current recoverable中文\0' }]);
    expect(target.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all()).toEqual(parents);
  } finally { await fixture.close(); }
});
