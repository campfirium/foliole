// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { retireDuplicateNodeInlineContent } from '../../lib/core/database/nodeInlineRetirement.js';
import { collectTextBodyBlobCandidates, collectTextBodyBlobCandidatesWithPort } from '../../lib/core/database/textBodyBlobCollection.js';

import { closeLibraries, createPeer, edit, startLibraries } from './syncEmptyLibraryTestSupport.js';
import { observeReads } from './syncNodeVerifiedTopicConflict.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);
const NOW = '2026-10-01T01:00:00.000Z';

it('protects and releases large raw text and nested JSON holders without complete body bridge reads', async () => {
  const peer = createPeer('source');
  const body = '\uFEFF' + ('🙂雪\u0000'.repeat(400000));
  const hash = upsertTextBodyBlob(peer.driver, body, NOW);
  peer.db.prepare('INSERT INTO editor_operation_history VALUES (1, ?, ?)')
    .run(JSON.stringify({ original: body }), NOW);
  peer.db.prepare(`INSERT INTO keep_import_item_cache
    (rule_id, source_path, title, content, source_mtime_ms, source_size_bytes, refreshed_at)
    VALUES ('large', 'original', 'Original', ?, 0, 0, ?)`)
    .run(body, NOW);
  const sizes: number[] = [];
  const inspect = <T extends DatabaseRow>(row: T | undefined) => {
    for (const value of Object.values(row ?? {})) {
      const size = typeof value === 'string' ? Buffer.byteLength(value)
        : value instanceof Uint8Array ? value.byteLength : 0;
      expect(size).toBeLessThanOrEqual(512 * 1024);
      if (size) sizes.push(size);
    }
    return row;
  };
  const driver: DatabaseDriver = { ...peer.driver,
    queryOne: <T extends DatabaseRow>(sql: string, params?: Parameters<DatabaseDriver['queryOne']>[1]) =>
      inspect(peer.driver.queryOne<T>(sql, params)),
    transaction: (run) => peer.driver.transaction(() => run(driver))
  };
  expect(collectTextBodyBlobCandidates(driver, [hash]).deletedHashes).toEqual([]);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(512 * 1024);
  expect(sizes.length).toBeGreaterThan(1);
  const reads = observeReads(peer.port);
  expect((await collectTextBodyBlobCandidatesWithPort(reads.port, [hash])).deletedHashes).toEqual([]);
  peer.db.prepare('DELETE FROM editor_operation_history').run();
  expect((await collectTextBodyBlobCandidatesWithPort(reads.port, [hash])).deletedHashes).toEqual([]);
  peer.db.prepare('DELETE FROM keep_import_item_cache').run();
  expect(await collectTextBodyBlobCandidatesWithPort(reads.port, [hash]))
    .toEqual({ deletedHashes: [hash], deletedBytes: Buffer.byteLength(body) });
  expect(Math.max(...reads.sizes)).toBeLessThanOrEqual(512 * 1024);
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(hash)).toBeUndefined();
});

it('collects only selected unheld text bodies and is idempotent', () => {
  const peer = createPeer('source');
  edit(peer, 'Current article');
  const current = peer.db.prepare('SELECT body_blob_hash FROM nodes WHERE id = ?').pluck().get('topic') as string;
  const garbage = upsertTextBodyBlob(peer.driver, 'Unused bytes', NOW);
  const untouched = upsertTextBodyBlob(peer.driver, 'Not selected', NOW);
  expect(collectTextBodyBlobCandidates(peer.driver, [current, garbage, garbage])).toEqual({
    deletedHashes: [garbage], deletedBytes: Buffer.byteLength('Unused bytes')
  });
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(garbage)).toBeUndefined();
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(untouched)).toBeDefined();
  expect(collectTextBodyBlobCandidates(peer.driver, [garbage]).deletedHashes).toEqual([]);
});

it('protects old version bytes and tombstone references after the node no longer holds them', () => {
  const peer = createPeer('source');
  const oldVersion = edit(peer, 'Old version body');
  peer.db.prepare('INSERT INTO node_version_local_holds VALUES (?, ?, ?, ?)')
    .run('editor', 'topic', oldVersion, NOW);
  const oldHash = peer.db.prepare('SELECT body_blob_hash FROM nodes WHERE id = ?').pluck().get('topic') as string;
  edit(peer, 'New version body');
  const tombHash = upsertTextBodyBlob(peer.driver, 'Deleted article', NOW);
  peer.db.prepare(`INSERT INTO node_sync_tombstones
    (node_id, version_id, host_name, content_hash, snapshot_json, deleted_at, created_at)
    VALUES ('deleted', 'tomb', 'source', 'fact', ?, ?, ?)`)
    .run(JSON.stringify({ body_blob_hash: tombHash }), NOW, NOW);
  expect(collectTextBodyBlobCandidates(peer.driver, [oldHash, tombHash]).deletedHashes).toEqual([]);
});

it('protects frozen dependency payloads until their explicit retirement', () => {
  const peer = createPeer('source');
  const hash = upsertTextBodyBlob(peer.driver, 'Frozen body', NOW);
  peer.db.prepare(`INSERT INTO sync_pack_dependency_rows VALUES
    ('group', 'peer', 'view', 'node', 'object', 0, 'nodes', '{}', ?, 'digest')`)
    .run(JSON.stringify({ body_blob_hash: hash }));
  expect(collectTextBodyBlobCandidates(peer.driver, [hash]).deletedHashes).toEqual([]);
  peer.db.prepare('DELETE FROM sync_pack_dependency_rows').run();
  expect(collectTextBodyBlobCandidates(peer.driver, [hash]).deletedHashes).toEqual([hash]);
});

it('rolls back payload deletion if metadata deletion fails', () => {
  const peer = createPeer('source');
  const hash = upsertTextBodyBlob(peer.driver, 'Rollback body', NOW);
  peer.db.exec("CREATE TRIGGER fail_gc BEFORE DELETE ON content_blobs BEGIN SELECT RAISE(ABORT, 'fail'); END");
  expect(() => collectTextBodyBlobCandidates(peer.driver, [hash])).toThrow('fail');
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(hash)).toBeDefined();
  expect(peer.db.prepare('SELECT hash FROM content_blobs WHERE hash = ?').get(hash)).toBeDefined();
});

it('protects cached import text and nested frozen references until they are retired', () => {
  const peer = createPeer('source');
  const cached = upsertTextBodyBlob(peer.driver, 'Cached original import text', NOW);
  const frozen = upsertTextBodyBlob(peer.driver, 'Frozen keyed body', NOW);
  peer.db.prepare(`INSERT INTO keep_import_item_cache
    (rule_id, source_path, title, content, source_mtime_ms, source_size_bytes, refreshed_at)
    VALUES ('rule', 'original', 'Original', ?, 0, 0, ?)`)
    .run('Cached original import text', NOW);
  peer.db.prepare(`INSERT INTO sync_pack_known_fact_claims VALUES
    ('group', 'peer', 'view', 'node', 'original', ?)`)
    .run(JSON.stringify({ resources: [{ [frozen]: { status: 'pending' } }] }));
  const before = peer.db.prepare('SELECT * FROM keep_import_item_cache').all();
  expect(collectTextBodyBlobCandidates(peer.driver, [cached, frozen]).deletedHashes).toEqual([]);
  expect(peer.db.prepare('SELECT * FROM keep_import_item_cache').all()).toEqual(before);
  peer.db.exec('DELETE FROM keep_import_item_cache; DELETE FROM sync_pack_known_fact_claims');
  expect(collectTextBodyBlobCandidates(peer.driver, [cached, frozen]).deletedHashes).toEqual([cached, frozen]);
});

it('refuses corrupt text bytes and never collects a non-text resource', () => {
  const peer = createPeer('source');
  const corrupt = upsertTextBodyBlob(peer.driver, 'Expected body', NOW);
  const image = upsertTextBodyBlob(peer.driver, 'Image bytes', NOW);
  peer.db.prepare("UPDATE content_blobs SET kind = 'image' WHERE hash = ?").run(image);
  peer.db.prepare('UPDATE content_blob_data SET data = ? WHERE hash = ?').run(Buffer.from('Damaged'), corrupt);
  expect(() => collectTextBodyBlobCandidates(peer.driver, [image, corrupt])).toThrow('text_body_collection_invalid_bytes');
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash IN (?, ?)').all(image, corrupt)).toHaveLength(2);
  expect(collectTextBodyBlobCandidates(peer.driver, [image]).deletedHashes).toEqual([]);
});

it('preserves malformed holder facts and aborts collection', () => {
  const peer = createPeer('source');
  const hash = upsertTextBodyBlob(peer.driver, 'Protected on parse failure', NOW);
  peer.db.prepare('INSERT INTO editor_operation_history VALUES (1, ?, ?)').run('invalid json', NOW);
  expect(() => collectTextBodyBlobCandidates(peer.driver, [hash])).toThrow();
  expect(peer.db.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(hash)).toBeDefined();
});

it('retires only exact inline duplicates without changing node or version facts', () => {
  const peer = createPeer('source');
  const body = '---\nauthor: Ada\n---\nComplete article';
  const version = edit(peer, body);
  peer.db.prepare('UPDATE nodes SET content = ? WHERE id = ?').run(body, 'topic');
  const before = peer.db.prepare('SELECT current_version_id, updated_at, sync_dirty FROM nodes WHERE id = ?').get('topic');
  const fact = peer.db.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(version);
  expect(retireDuplicateNodeInlineContent(peer.driver, ['topic'])).toEqual({ changed: 1, protectedNodeIds: [] });
  expect(peer.db.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe('---\nauthor: Ada\n---\n');
  expect(peer.db.prepare('SELECT current_version_id, updated_at, sync_dirty FROM nodes WHERE id = ?').get('topic')).toEqual(before);
  expect(peer.db.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(version)).toEqual(fact);
  expect(retireDuplicateNodeInlineContent(peer.driver, ['topic']).changed).toBe(0);
  peer.db.prepare('UPDATE nodes SET content = ? WHERE id = ?').run('Contradictory fact', 'topic');
  expect(retireDuplicateNodeInlineContent(peer.driver, ['topic']).protectedNodeIds).toEqual(['topic']);
  expect(peer.db.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe('Contradictory fact');
});

it('does not retire inline facts when the referenced blob metadata is not a text body', () => {
  const peer = createPeer('source');
  edit(peer, 'Original inline fact');
  peer.db.prepare('UPDATE nodes SET content = ?').run('Original inline fact');
  peer.db.prepare("UPDATE content_blobs SET kind = 'image'").run();
  expect(retireDuplicateNodeInlineContent(peer.driver, ['topic']))
    .toEqual({ changed: 0, protectedNodeIds: ['topic'] });
  expect(peer.db.prepare('SELECT content FROM nodes').pluck().get()).toBe('Original inline fact');
});
