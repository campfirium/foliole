// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { readDataMigrationState } from '../../lib/core/database/dataMigrationState.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { runLegacyBodyCollectionBatch } from './legacyBodyCollectionBatch.js';
import { migrateLegacyBodyConsistency } from './legacyBodyConsistencyMigration.js';
import { BODY_COLLECTION_ID, BODY_REPAIR_ID } from './legacyBodyMigrationState.js';
import { assertPersisted, closeLibraries, createPeer, edit as editNode, history, joinPeers, startLibraries, sync } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);
const NOW = '2026-10-01T00:00:00Z';
function edit(peer: ReturnType<typeof createPeer>, body: string) {
  const version = editNode(peer, body);
  upsertTextBodyBlob(peer.driver, body, NOW);
  return version;
}
function upgrade(peer: ReturnType<typeof createPeer>) {
  initializeDatabaseSchema(peer.db, { beforeVersionCommit: () => migrateLegacyBodyConsistency(
    { driver: peer.driver, sqlite: peer.db }, peer.name, false) });
}
function batch(peer: ReturnType<typeof createPeer>, limit = 1) {
  return runLegacyBodyCollectionBatch({ driver: peer.driver, sqlite: peer.db }, limit);
}

it('upgrades in the schema transaction and publishes repaired facts through production sync during collection', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const original = edit(source, 'Full original body');
  source.db.prepare('UPDATE node_sync_versions SET body_text = ? WHERE version_id = ?').run('', original);
  await sync(source, target);
  const old = history(source);
  const garbage = upsertTextBodyBlob(source.driver, 'Unused', NOW);
  source.db.pragma('user_version = 123');
  upgrade(source);
  expect(readDataMigrationState(source.db, BODY_REPAIR_ID)?.status).toBe('completed');
  expect(history(source)).toHaveLength(old.length + 1);
  expect(history(source).find((row) => row.version_id === original)).toEqual(old[0]);
  upgrade(source);
  expect(history(source)).toHaveLength(old.length + 1);
  batch(source);
  edit(source, 'Edited while maintenance is incomplete');
  await sync(source, target);
  while (!batch(source).completed) { /* bounded persisted batches */ }
  while (!batch(target).completed) { /* independent library */ }
  assertPersisted(source, 'Edited while maintenance is incomplete');
  assertPersisted(target, 'Edited while maintenance is incomplete');
  expect(source.db.prepare('SELECT hash FROM content_blobs WHERE hash = ?').get(garbage)).toBeUndefined();
  const count = history(source).length;
  expect(batch(source)).toEqual({ completed: true, paused: false });
  expect(history(source)).toHaveLength(count);
});

it.each(['dirty', 'editing', 'contradictory', 'corrupt'] as const)('protects %s facts and reports the exact node', (kind) => {
  const peer = createPeer('source');
  const version = edit(peer, 'Canonical');
  peer.db.prepare('UPDATE node_sync_versions SET body_text = ? WHERE version_id = ?').run('', version);
  if (kind === 'dirty') peer.db.prepare('UPDATE nodes SET sync_dirty = 1').run();
  if (kind === 'editing') peer.db.prepare('INSERT INTO node_version_local_holds VALUES (?, ?, ?, ?)').run('editor', 'topic', version, NOW);
  if (kind === 'contradictory') peer.db.prepare('UPDATE nodes SET content = ?').run('Other original');
  if (kind === 'corrupt') peer.db.prepare('UPDATE content_blob_data SET data = ?').run(Buffer.from('Broken'));
  const before = history(peer);
  upgrade(peer);
  expect(history(peer)).toEqual(before);
  expect(readDataMigrationState(peer.db, BODY_REPAIR_ID)?.status).toBe('running');
  expect(peer.db.prepare('SELECT object_id, reason FROM legacy_body_migration_protections WHERE migration_id = ?')
    .all(BODY_REPAIR_ID)).toEqual([{ object_id: 'topic', reason: {
    dirty: 'node_dirty', editing: 'editor_active', contradictory: 'contradictory_inline_body', corrupt: 'body_blob_invalid_or_missing'
  }[kind] }]);
  if (kind === 'dirty' || kind === 'editing') {
    peer.db.prepare('UPDATE nodes SET sync_dirty = 0').run();
    peer.db.prepare('DELETE FROM node_version_local_holds').run();
    upgrade(peer);
    expect(history(peer)).toHaveLength(before.length + 1);
    expect(readDataMigrationState(peer.db, BODY_REPAIR_ID)?.status).toBe('completed');
  }
});

it('rolls back the entire upgrade and its marker when version publication fails', () => {
  const peer = createPeer('source');
  const version = edit(peer, 'Canonical');
  peer.db.prepare('UPDATE node_sync_versions SET body_text = ? WHERE version_id = ?').run('', version);
  peer.db.pragma('user_version = 123');
  peer.db.exec("CREATE TRIGGER reject_repair BEFORE UPDATE ON sync_object_state BEGIN SELECT RAISE(ABORT, 'failed'); END");
  const before = history(peer);
  expect(() => upgrade(peer)).toThrow('failed');
  expect(peer.db.pragma('user_version', { simple: true })).toBe(123);
  expect(readDataMigrationState(peer.db, BODY_REPAIR_ID)).toBeNull();
  expect(history(peer)).toEqual(before);
});

it('preserves complete current text and resumes the failed cache collection batch', () => {
  const peer = createPeer('source');
  edit(peer, 'Canonical');
  peer.db.prepare('UPDATE nodes SET content = ?').run('Contradictory original');
  const garbage = upsertTextBodyBlob(peer.driver, 'Unused', NOW);
  const cursor = peer.db.prepare('SELECT cursor FROM legacy_body_migration_progress WHERE migration_id = ?').get(BODY_COLLECTION_ID);
  peer.db.exec("CREATE TRIGGER reject_gc BEFORE DELETE ON content_blobs BEGIN SELECT RAISE(ABORT, 'batch_failed'); END");
  expect(() => { while (!batch(peer).completed) { /* process until failed deletion */ } }).toThrow('batch_failed');
  expect(peer.db.prepare('SELECT data FROM content_blob_data WHERE hash = ?').get(garbage)).toBeDefined();
  expect(peer.db.prepare('SELECT error FROM legacy_body_migration_progress WHERE migration_id = ?').pluck().get(BODY_COLLECTION_ID)).toBe('batch_failed');
  expect(cursor).toBeUndefined();
  peer.db.exec('DROP TRIGGER reject_gc');
  while (!batch(peer).completed) { /* resume same cursor */ }
  expect(peer.db.prepare('SELECT content FROM nodes').pluck().get()).toBe('Contradictory original');
  expect(peer.db.prepare('SELECT * FROM legacy_body_migration_protections WHERE migration_id = ?').all(BODY_COLLECTION_ID)).toEqual([]);
  expect(peer.db.prepare('SELECT hash FROM content_blobs WHERE hash = ?').get(garbage)).toBeUndefined();
});

it('requires a safety snapshot only for a retry that can actually append a version', async () => {
  const { needsLegacyBodyConsistencySnapshot } = await import('./legacyBodyConsistencyMigration.js');
  const peer = createPeer('source');
  const version = edit(peer, 'Canonical');
  peer.db.prepare("UPDATE node_sync_versions SET body_text = '' WHERE version_id = ?").run(version);
  peer.db.prepare('UPDATE nodes SET sync_dirty = 1').run();
  upgrade(peer);
  const connection = { sqlite: peer.db, driver: peer.driver };
  expect(needsLegacyBodyConsistencySnapshot(connection)).toBe(false);
  peer.db.prepare('UPDATE nodes SET sync_dirty = 0').run();
  expect(needsLegacyBodyConsistencySnapshot(connection)).toBe(true);
  upgrade(peer);
  expect(needsLegacyBodyConsistencySnapshot(connection)).toBe(false);
});

it('repairs an unavailable current version of an empty canonical body using the actual consumer contract', () => {
  const peer = createPeer('source');
  const version = edit(peer, '');
  const snapshot = JSON.parse(peer.db.prepare('SELECT snapshot_json FROM node_sync_versions WHERE version_id = ?').pluck().get(version) as string);
  peer.db.prepare('UPDATE node_sync_versions SET body_text = NULL, snapshot_json = ? WHERE version_id = ?')
    .run(JSON.stringify({ ...snapshot, content: null }), version);
  upgrade(peer);
  const current = peer.db.prepare('SELECT current_version_id FROM nodes').pluck().get();
  expect(current).not.toBe(version);
  expect(peer.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(current)).toBe('');
  expect(peer.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(version)).toBeNull();
});

it.each(['inline', 'retry'] as const)('resumes an old %s cursor without reducing current text or changing version facts', (phase) => {
  const peer = createPeer('source');
  const version = edit(peer, 'Canonical');
  peer.db.prepare('INSERT INTO node_version_local_holds VALUES (?, ?, ?, ?)').run('editor', 'topic', version, NOW);
  peer.db.prepare('INSERT INTO legacy_body_migration_progress VALUES (?, ?, ?, 0, 0, 0, NULL)')
    .run(BODY_COLLECTION_ID, phase, 'obsolete-cursor');
  peer.db.prepare('INSERT INTO legacy_body_migration_protections VALUES (?, ?, ?)')
    .run(BODY_COLLECTION_ID, 'topic', 'editor_active');
  const garbage = upsertTextBodyBlob(peer.driver, 'Unused cache', NOW);
  const nodes = peer.db.prepare('SELECT * FROM nodes').all();
  const versions = history(peer);
  const holds = peer.db.prepare('SELECT * FROM node_version_local_holds').all();
  expect(batch(peer, 32)).toMatchObject({ completed: true, paused: false });
  expect(readDataMigrationState(peer.db, BODY_COLLECTION_ID)?.status).toBe('completed');
  expect(peer.db.prepare('SELECT * FROM nodes').all()).toEqual(nodes);
  expect(history(peer)).toEqual(versions);
  expect(peer.db.prepare('SELECT * FROM node_version_local_holds').all()).toEqual(holds);
  expect(peer.db.prepare('SELECT hash FROM content_blobs WHERE hash = ?').get(garbage)).toBeUndefined();
  const laterGarbage = upsertTextBodyBlob(peer.driver, 'Created after the collection pass', NOW);
  expect(batch(peer, 32)).toEqual({ completed: true, paused: false });
  expect(peer.db.prepare('SELECT hash FROM content_blobs WHERE hash = ?').get(laterGarbage)).toBeDefined();
});
