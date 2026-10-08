// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { contentPackFixture, packHash, packTime } from '../../../../../electron/database/companionContentPack.testSupport.js';
import { applyCompanionContentPack } from '../../../../../lib/core/sync/companionBatchDataPlane.js';

import { commitStagedCompanionContentBatch } from './companionBatchDataPlane.js';

it.each(['\ufeff完整正文😀\r\n\u0000end', '---\r\ntitle: Article\r\n---\r\nComplete body'])('preserves complete current text and original version when a content cache arrives: %j', async (body) => {
  const host = contentPackFixture([body]);
  try {
    const entry = host.entries[0]!;
    host.sqlite.prepare(`INSERT INTO nodes (id, kind, title, content, body_blob_hash,
      current_version_id, created_at, updated_at, sync_dirty)
      VALUES ('article', 'topic', 'Article', ?, ?, 'original', 'now', 'now', 0)`).run(body, entry.hash);
    host.sqlite.prepare(`INSERT INTO node_sync_versions (version_id, object_id, host_name,
      created_at, content_hash, body_text, snapshot_json)
      VALUES ('original', 'article', 'source', 'now', 'identity', ?, ?)`).run(body, JSON.stringify({ id: 'article', content: body }));
    const versions = host.sqlite.prepare('SELECT * FROM node_sync_versions').all();
    await applyCompanionContentPack(host.db, { failedHashes: [], now: packTime, packPath: host.path });
    expect(host.sqlite.prepare('SELECT content, current_version_id, sync_dirty FROM nodes').get())
      .toEqual({ content: body, current_version_id: 'original', sync_dirty: 0 });
    expect(host.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
  } finally { host.close(); }
});

it('adopts a legacy cache pack without creating permanent chunk storage', async () => {
  const host = contentPackFixture(['\ufeffDefault中文😀\0']);
  try {
    const entry = host.entries[0]!;
    expect(await applyCompanionContentPack(host.db, {
      failedHashes: [], now: packTime, packPath: host.path
    })).toEqual({ failedHashes: [], syncedHashes: [entry.hash] });
    expect(host.sqlite.prepare('SELECT data FROM content_blob_data WHERE hash = ?').pluck().get(entry.hash)).toEqual(entry.bytes);
    expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('content_bodies', 'content_body_chunks')").all()).toEqual([]);
  } finally { host.close(); }
});

it('adopts empty and Unicode legacy caches with original status and completion payloads', async () => {
  const host = contentPackFixture(['', '\ufeff中文🌿\0' + '正文😀'.repeat(70_000)]);
  try {
    const failedHash = 'f'.repeat(64);
    host.sqlite.prepare(`INSERT INTO content_blobs (hash, storage_key, kind, mime_type, compression,
      original_size_bytes, stored_size_bytes, original_sha256, stored_sha256, availability, created_at,
      cached_at, last_verified_at) SELECT ?, storage_key, kind, mime_type, compression,
      original_size_bytes, stored_size_bytes, original_sha256, stored_sha256, availability, created_at,
      cached_at, last_verified_at FROM content_blobs LIMIT 1`).run(failedHash);
    const finished: unknown[] = [];
    const owner = { runWriter: <T>(task: (db: typeof host.db) => Promise<T>) => task(host.db) };
    const plugin = { finishContentBlobBatch: async (args: unknown) => { finished.push(args); return {}; } };
    const result = await commitStagedCompanionContentBatch(owner as never, plugin as never, {
      batch_token: 'native-token', pack_path: host.path, failed_hashes: [failedHash], synced_hashes: []
    }, packTime);
    expect(result).toEqual({ failedHashes: [failedHash], syncedHashes: host.entries.map(({ hash }) => hash).sort() });
    expect(finished).toEqual([{ batch_token: 'native-token', committed: true }]);
    for (const entry of host.entries) {
      const raw = host.sqlite.prepare('SELECT data FROM content_blob_data WHERE hash = ?').pluck().get(entry.hash) as Uint8Array;
      expect(Buffer.from(raw)).toEqual(entry.bytes);
      expect(packHash(raw)).toBe(entry.hash);
      expect(host.sqlite.prepare('SELECT availability, cached_at, last_verified_at FROM content_blobs WHERE hash = ?')
        .get(entry.hash)).toEqual({ availability: 'cached', cached_at: packTime, last_verified_at: packTime });
    }
    expect(host.sqlite.prepare('SELECT availability FROM content_blobs WHERE hash = ?').pluck().get(failedHash)).toBe('failed');
    expect(host.sqlite.prepare('PRAGMA database_list').all()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'content_batch' })]));
  } finally { host.close(); }
});

it('rolls all adopted bodies and statuses back after a late cached update fails and permits retry', async () => {
  const host = contentPackFixture(['\ufeff第一😀\0' + '大正文'.repeat(70_000), 'second']);
  try {
    const lastHash = host.entries.map(({ hash }) => hash).sort().at(-1)!;
    host.sqlite.exec(`CREATE TRIGGER reject_pack_commit BEFORE UPDATE OF availability ON content_blobs
      WHEN NEW.hash = '${lastHash}' AND NEW.availability = 'cached'
      BEGIN SELECT RAISE(ABORT, 'late_pack_failure'); END`);
    const finished: unknown[] = [];
    const owner = { runWriter: <T>(task: (db: typeof host.db) => Promise<T>) => task(host.db) };
    const plugin = { finishContentBlobBatch: async (args: unknown) => { finished.push(args); return {}; } };
    const download = { batch_token: 'retry-token', pack_path: host.path, synced_hashes: [] };
    await expect(commitStagedCompanionContentBatch(owner as never, plugin as never, download, packTime))
      .rejects.toThrow('late_pack_failure');
    expect(finished).toEqual([{ batch_token: 'retry-token', committed: false }]);
    expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('content_bodies', 'content_body_chunks')").all()).toEqual([]);
    expect(host.sqlite.prepare("SELECT count(*) FROM content_blobs WHERE availability != 'missing' OR cached_at IS NOT NULL").pluck().get()).toBe(0);
    expect(host.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
    host.sqlite.exec('DROP TRIGGER reject_pack_commit');
    await commitStagedCompanionContentBatch(owner as never, plugin as never, download, packTime);
    expect(finished.at(-1)).toEqual({ batch_token: 'retry-token', committed: true });
    for (const entry of host.entries) {
      expect(host.sqlite.prepare('SELECT CAST(data AS TEXT) FROM content_blob_data WHERE hash = ?').pluck().get(entry.hash)).toBe(entry.body);
    }
  } finally { host.close(); }
});

it('rejects equal-length pack tampering against the original raw digest without persisting body state', async () => {
  const host = contentPackFixture(['original']);
  try {
    const pack = new Database(host.path);
    pack.prepare('UPDATE content_blob_batch SET data = ?').run(Buffer.from('tampered'));
    pack.close();
    await expect(applyCompanionContentPack(host.db, {
      failedHashes: [], now: packTime, packPath: host.path
    })).rejects.toThrow('content_pack_body_hash_mismatch');
    expect(host.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
    expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('content_bodies', 'content_body_chunks')").all()).toEqual([]);
    expect(host.sqlite.prepare('SELECT availability FROM content_blobs').pluck().get()).toBe('missing');
    expect(host.sqlite.prepare('PRAGMA database_list').all()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'content_batch' })]));
  } finally { host.close(); }
});
