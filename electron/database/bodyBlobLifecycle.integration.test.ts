// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/contentBodyBlobs.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { collectNodeVersionChainWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { releaseLocalEditBase, retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { readSyncPackCursorWithDbPort } from '../../lib/core/sync/syncPackCursor.js';
import { describeVersionFact, type SyncVersionFact } from '../../lib/core/sync/syncPackFactPresence.js';
import { stageSyncPackKnownFactClaims } from '../../lib/core/sync/syncPackKnownFactClaims.js';


import { assertPersisted, buildPack, closeLibraries, createPeer, edit, joinPeers, receivePack, startLibraries, sync } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);
const NOW = '2026-10-02T12:00:00.000Z';

it('reclaims the unversioned import body after image localization while keeping the final body', () => {
  const peer = createPeer('source');
  peer.db.prepare("INSERT INTO nodes (id,kind,title,created_at,updated_at) VALUES ('topic','topic','Article',?,?)").run(NOW, NOW);
  const original = '# Article\n![Cover](https://example.com/cover.png)';
  writeNodeBody({ driver: peer.driver, nodeId: 'topic', title: 'Article', content: original, updatedAt: NOW });
  const final = '# Article\n![Cover](asset://' + 'a'.repeat(64) + ')';
  writeNodeBody({ driver: peer.driver, nodeId: 'topic', title: 'Article', content: final, updatedAt: NOW });
  expect(peer.db.prepare('SELECT hash FROM content_blobs WHERE hash=?').get(hashTextBody(original))).toBeUndefined();
  expect(peer.db.prepare('SELECT data FROM content_blob_data WHERE hash=?').get(hashTextBody(final))).toEqual({ data: Buffer.from(final) });
});

it('keeps a cached original when image localization replaces the node body', () => {
  const peer = createPeer('source');
  peer.db.prepare("INSERT INTO nodes (id,kind,title,created_at,updated_at) VALUES ('topic','topic','Article',?,?)").run(NOW, NOW);
  const original = 'Cached original image body';
  peer.db.prepare(`INSERT INTO keep_import_item_cache
    (rule_id,source_path,title,content,source_mtime_ms,source_size_bytes,refreshed_at) VALUES ('rule','file','Article',?,0,0,?)`).run(original, NOW);
  writeNodeBody({ driver: peer.driver, nodeId: 'topic', title: 'Article', content: original, updatedAt: NOW });
  writeNodeBody({ driver: peer.driver, nodeId: 'topic', title: 'Article', content: 'Localized body', updatedAt: NOW });
  expect(peer.db.prepare('SELECT data FROM content_blob_data WHERE hash=?').get(hashTextBody(original))).toEqual({ data: Buffer.from(original) });
});

it('keeps an editor base through two-peer sync and reclaims its body only when the last hold exits', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const old = edit(source, 'Previous body');
  await sync(source, target);
  for (const peer of [source, target]) {
    await retainLocalEditBase(peer.port, { holdId: 'editor', nodeId: 'topic', versionId: old });
  }
  edit(source, 'Current body');
  await sync(source, target);
  for (const peer of [source, target]) {
    expect(peer.db.prepare('SELECT data FROM content_blob_data WHERE hash=?').get(hashTextBody('Previous body'))).toBeDefined();
    await releaseLocalEditBase(peer.port, 'editor', 'topic');
    expect(peer.db.prepare('SELECT version_id FROM node_sync_versions WHERE version_id=?').get(old)).toBeUndefined();
    expect(peer.db.prepare('SELECT hash FROM content_blobs WHERE hash=?').get(hashTextBody('Previous body'))).toBeUndefined();
    assertPersisted(peer, 'Current body');
  }
});

it('reclaims released bodies through the synchronous host chain collector too', () => {
  const peer = createPeer('source');
  const old = edit(peer, 'Old local body');
  peer.db.prepare('INSERT INTO node_version_local_holds VALUES (?,?,?,?)').run('editor','topic',old,NOW);
  edit(peer, 'Current local body');
  peer.db.prepare('DELETE FROM node_version_local_holds WHERE hold_id=?').run('editor');
  collectNodeVersionChainWithDriver(peer.driver, 'topic');
  expect(peer.db.prepare('SELECT version_id FROM node_sync_versions WHERE version_id=?').get(old)).toBeUndefined();
  expect(peer.db.prepare('SELECT hash FROM content_blobs WHERE hash=?').get(hashTextBody('Old local body'))).toBeUndefined();
  assertPersisted(peer, 'Current local body');
});

it('does not create an unused body when its target node has disappeared', () => {
  const peer = createPeer('source');
  expect(() => writeNodeBody({ driver: peer.driver, nodeId: 'missing', title: 'Article',
    content: 'No target', updatedAt: NOW })).toThrow('node_body_target_missing');
  expect(peer.db.prepare('SELECT hash FROM content_blobs WHERE hash=?').get(hashTextBody('No target'))).toBeUndefined();
});

it('rolls back a body replacement when holder facts cannot be checked safely', () => {
  const peer = createPeer('source');
  peer.db.prepare("INSERT INTO nodes (id,kind,title,created_at,updated_at) VALUES ('topic','topic','Article',?,?)").run(NOW, NOW);
  writeNodeBody({ driver: peer.driver, nodeId: 'topic', title: 'Article', content: 'Original fact', updatedAt: NOW });
  peer.db.prepare('INSERT INTO editor_operation_history VALUES (1,?,?)').run('invalid json', NOW);
  expect(() => writeNodeBody({ driver: peer.driver, nodeId: 'topic', title: 'Article',
    content: 'Replacement fact', updatedAt: NOW })).toThrow();
  expect(peer.db.prepare('SELECT body_blob_hash FROM nodes WHERE id=?').get('topic'))
    .toEqual({ body_blob_hash: hashTextBody('Original fact') });
  expect(peer.db.prepare('SELECT hash FROM content_blobs WHERE hash=?').get(hashTextBody('Original fact'))).toBeDefined();
  expect(peer.db.prepare('SELECT hash FROM content_blobs WHERE hash=?').get(hashTextBody('Replacement fact'))).toBeUndefined();
});

it('reclaims the replaced body after the sync page releases its temporary fact claims', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const oldVersion = edit(source, 'Previous synced body');
  await sync(source, target);
  const old = target.db.prepare('SELECT * FROM node_sync_versions WHERE version_id=?').get(oldVersion);
  const fact = describeVersionFact(old as Parameters<typeof describeVersionFact>[0]);
  edit(source, 'Current synced body');
  const pack = await buildPack(source, target);
  target.db.prepare('ATTACH DATABASE ? AS inc').run(pack.incoming);
  const cursor = await readSyncPackCursorWithDbPort(target.port, 'inc');
  target.db.exec('DETACH DATABASE inc');
  await stageSyncPackKnownFactClaims(target.port, { groupId: 'group', peerId: source.id,
    sourceViewId: cursor.packId! }, { index_id: 'index', from_state_seq: cursor.fromStateSeq,
    to_state_seq: cursor.toStateSeq, frontier_state_seq: cursor.frontierStateSeq,
    source_epoch: cursor.sourceEpoch, versions: [fact as SyncVersionFact], parents: [], reviews: [] });
  await receivePack(source, target, pack);
  assertPersisted(source, 'Current synced body');
  assertPersisted(target, 'Current synced body');
  expect(target.db.prepare('SELECT * FROM sync_pack_known_fact_claims').all()).toEqual([]);
  expect(target.db.prepare('SELECT version_id FROM node_sync_versions WHERE version_id=?').get(oldVersion)).toBeUndefined();
  expect(target.db.prepare('SELECT hash FROM content_blobs WHERE hash=?').get(hashTextBody('Previous synced body'))).toBeUndefined();
});
