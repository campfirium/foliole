// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { collectNodeVersionChainWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { describeVersionFact, probeSyncPackFactPresence } from '../../lib/core/sync/syncPackFactPresence.js';

import { closeLibraries, createPeer, edit, history, startLibraries } from './syncEmptyLibraryTestSupport.js';

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
  else expect(await collectNodeVersionPayloads(peer.port, 'topic')).toEqual({ released: 1, skipped: null });
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
    .get(hashTextBody(CURRENT))).toBeDefined();
  expect(history(peer).find((row) => row.version_id === original)).toMatchObject({ body_text: null });
});

it('rolls back retired reference release when blob deletion fails', async () => {
  const peer = createPeer('source');
  const original = edit(peer, ORIGINAL);
  edit(peer, CURRENT);
  const hash = upsertTextBodyBlob(peer.driver, ORIGINAL, 'now');
  peer.db.prepare(`UPDATE node_sync_versions SET snapshot_json =
    json_set(snapshot_json, '$.body_blob_hash', ?) WHERE version_id = ?`).run(hash, original);
  const before = history(peer);
  peer.db.exec("CREATE TRIGGER fail_gc BEFORE DELETE ON content_blobs BEGIN SELECT RAISE(ABORT, 'fail'); END");
  await expect(collectNodeVersionPayloads(peer.port, 'topic')).rejects.toThrow('fail');
  expect(history(peer)).toEqual(before);
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(hash)).toBeDefined();
});

it('keeps an effective alternative and its source body intact during normal collection', async () => {
  const peer = createPeer('source');
  const original = edit(peer, ORIGINAL);
  peer.db.prepare(`INSERT INTO node_text_alternatives
    (alternative_id, node_id, source_version_id, body_text, source_host_name, created_at, status, updated_at)
    VALUES ('alternative', 'topic', ?, ?, 'source', 'now', 'available', 'now')`).run(original, ORIGINAL);
  const before = peer.db.prepare('SELECT * FROM node_text_alternatives').all();
  edit(peer, CURRENT);
  await collectNodeVersionPayloads(peer.port, 'topic');
  expect(history(peer).find((row) => row.version_id === original)?.body_text).toBe(ORIGINAL);
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(hashTextBody(ORIGINAL))).toBeDefined();
  expect(peer.db.prepare('SELECT * FROM node_text_alternatives').all()).toEqual(before);
});

it('accepts complete and retired forms of one fact while rejecting identity and complete-body contradictions', async () => {
  const peer = createPeer('source');
  const original = edit(peer, ORIGINAL);
  const load = () => {
    const row = peer.driver.queryOne<Parameters<typeof describeVersionFact>[0]>(
      `SELECT *, json_remove(snapshot_json, '$.content') AS snapshot_metadata
        FROM node_sync_versions WHERE version_id = ?`, [original]);
    if (!row) throw new Error('test_version_missing');
    return describeVersionFact(row);
  };
  const complete = load();
  expect(JSON.parse(complete.snapshot_metadata)).not.toHaveProperty('body_blob_hash');
  const page = { versions: [complete], parents: [], reviews: [] };
  expect((await probeSyncPackFactPresence(peer.port, page)).versions).toEqual([original]);
  await expect(probeSyncPackFactPresence(peer.port, {
    ...page, versions: [{ ...complete, body_hash: hashTextBody('Contradictory body') }]
  })).rejects.toThrow('sync_pack_node_version_immutable_mismatch');
  edit(peer, CURRENT);
  expect(load()).toEqual({ ...complete, body_hash: null });
  expect((await probeSyncPackFactPresence(peer.port, page)).versions).toEqual([]);
  await expect(probeSyncPackFactPresence(peer.port, {
    ...page, versions: [{ ...complete, content_hash: 'contradictory-identity' }]
  })).rejects.toThrow('sync_pack_node_version_immutable_mismatch');
  await expect(probeSyncPackFactPresence(peer.port, {
    ...page, versions: [{ ...complete, snapshot_metadata: JSON.stringify({ title: 'Contradictory title' }) }]
  })).rejects.toThrow('sync_pack_node_version_immutable_mismatch');
});
