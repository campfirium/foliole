// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { collectNodeVersionChainWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { branch, business, identity, receive } from '../sync/syncPackStoredVersionDependencies.testSupport.js';

import { runLegacyBodyCollectionBatch } from './legacyBodyCollectionBatch.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { closeLibraries, createPeer, edit, history, startLibraries } from './syncLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);
const ORIGINAL = `Original body\n${'Original paragraph.\n'.repeat(100)}`;
const CURRENT = `Current body\n${'Current paragraph.\n'.repeat(100)}`;

it.each(['driver', 'port'] as const)('releases existing retired hash residue through %s without changing lineage', async (adapter) => {
  const peer = createPeer('source');
  const original = edit(peer, ORIGINAL);
  edit(peer, CURRENT);
  const hash = upsertTextBodyBlob(peer.driver, ORIGINAL, 'now');
  peer.db.prepare(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_blob_hash', ?)
    WHERE version_id = ?`).run(hash, original);
  const lineage = history(peer).map(({ version_id, parent_version_id }) => ({ version_id, parent_version_id }));
  const edges = peer.db.prepare('SELECT * FROM node_sync_version_parents').all();
  if (adapter === 'driver') collectNodeVersionChainWithDriver(peer.driver, 'topic');
  else expect(await collectNodeVersionPayloads(peer.port, 'topic')).toEqual({ released: 0, skipped: null });
  while (!runLegacyBodyCollectionBatch({ driver: peer.driver, sqlite: peer.db }, 32).completed) { /* explicit cache collection */ }
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(hash)).toBeUndefined();
  expect(peer.db.prepare('SELECT hash FROM content_blobs WHERE hash = ?').get(hash)).toBeUndefined();
  expect(history(peer).map(({ version_id, parent_version_id }) => ({ version_id, parent_version_id }))).toEqual(lineage);
  expect(peer.db.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual(edges);
  expect(await collectNodeVersionPayloads(peer.port, 'topic')).toEqual({ released: 0, skipped: null });
});

it('retires replaced snapshot hashes during normal edits while retaining the current body', () => {
  const peer = createPeer('source');
  const original = edit(peer, ORIGINAL);
  edit(peer, CURRENT);
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?')
    .get(hashTextBody(ORIGINAL))).toBeUndefined();
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?')
    .get(hashTextBody(CURRENT))).toBeUndefined();
  expect(peer.db.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get()).toBe(CURRENT);
  expect(history(peer).find((row) => row.version_id === original)).toMatchObject({ body_text: null });
});

it('rolls back retired reference release when blob deletion fails', async () => {
  const peer = createPeer('source');
  const original = edit(peer, ORIGINAL);
  edit(peer, CURRENT);
  const hash = upsertTextBodyBlob(peer.driver, ORIGINAL, 'now');
  peer.db.prepare(`UPDATE node_sync_versions SET body_text = ?, snapshot_json =
    json_set(snapshot_json, '$.body_blob_hash', ?, '$.content', ?, '$.body_deleted', json('false'))
    WHERE version_id = ?`).run(ORIGINAL, hash, ORIGINAL, original);
  const before = history(peer);
  peer.db.exec("CREATE TRIGGER fail_gc BEFORE DELETE ON content_blobs BEGIN SELECT RAISE(ABORT, 'fail'); END");
  await expect(collectNodeVersionPayloads(peer.port, 'topic')).rejects.toThrow('fail');
  expect(history(peer)).toEqual(before);
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(hash)).toBeDefined();
});

it('keeps an independently stored alternative while retiring its old main source', async () => {
  const peer = createPeer('source');
  const original = edit(peer, ORIGINAL);
  peer.db.prepare(`INSERT INTO node_text_alternatives
    (alternative_id, node_id, source_version_id, body_text, source_host_name, created_at, status, updated_at)
    VALUES ('alternative', 'topic', ?, ?, 'source', 'now', 'available', 'now')`).run(original, ORIGINAL);
  const before = peer.db.prepare('SELECT * FROM node_text_alternatives').all();
  edit(peer, CURRENT);
  await collectNodeVersionPayloads(peer.port, 'topic');
  expect(history(peer).find((row) => row.version_id === original)?.body_text).toBeNull();
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(hashTextBody(ORIGINAL))).toBeUndefined();
  expect(peer.db.prepare('SELECT * FROM node_text_alternatives').all()).toEqual(before);
});

it('accepts complete and retired forms through current requests while rejecting immutable contradictions', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target'); const retired = fixture.peer('observer');
  try {
    const original = branch('original', ORIGINAL);
    const head = branch('head', CURRENT, original, '2026-05-05T00:00:00.000Z');
    await receive(source, target, [original]);
    const beforeBodyConflict = business(target);
    await expect(receive(source, target, [{ ...original, body_text: 'Contradictory body',
      snapshot: { ...original.snapshot, content: 'Contradictory body' } }]))
      .rejects.toThrow(/^sync_pack_node_version_immutable_mismatch:original$/u);
    expect(business(target)).toEqual(beforeBodyConflict);
    await receive(source, target, [identity(original), head]); target.reopen();
    expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'original'").get())
      .toEqual({ body_text: null });
    await receive(source, retired, [identity(original), head]); retired.reopen();
    expect(retired.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'original'").get())
      .toEqual({ body_text: null });
    for (const contradictory of [
      { ...identity(original), content_hash: 'f'.repeat(64) },
      { ...identity(original), snapshot: { ...identity(original).snapshot, title: 'Contradictory title' } }
    ]) {
      const before = business(retired);
      await expect(receive(source, retired, [contradictory]))
        .rejects.toThrow(/^sync_pack_node_version_immutable_mismatch:original$/u);
      retired.reopen(); expect(business(retired)).toEqual(before);
    }
    for (let replay = 0; replay < 2; replay++) {
      await receive(source, retired, [original, head]); retired.reopen();
      expect(retired.sqlite.prepare('SELECT version_id, body_text FROM node_sync_versions ORDER BY version_id').all())
        .toEqual([{ version_id: 'head', body_text: CURRENT }, { version_id: 'original', body_text: null }]);
      expect(retired.sqlite.prepare('SELECT version_id, parent_version_id FROM node_sync_version_parents').all())
        .toEqual([{ version_id: 'head', parent_version_id: 'original' }]);
    }
  } finally { await fixture.close(); }
});
