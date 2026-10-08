// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { upsertTextBodyBlob } from '../database/contentBodyBlobs.js';
import { initializeDatabaseSchema } from '../database/migrations.js';

import { clearWorkgroupSyncDataForRestore } from './syncGroupRestoreReset.js';

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach((sqlite) => sqlite.close()));
const at = '2026-10-07T00:00:00.000Z';
const texts = { node: 'Old node', cache: '\ufeffCache 中😀\0body',
  incoming: 'Surviving update', discarded: 'Deleted update' };

function fixture() {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  sqlite.pragma('foreign_keys = ON');
  initializeDatabaseSchema(sqlite);
  const driver = createBetterSqlite3Driver(sqlite);
  const db = createBetterSqliteDbPort(sqlite);
  const nodeHash = upsertTextBodyBlob(driver, texts.node, at);
  for (const id of ['topic', 'special-inbox', 'special-virtual-root']) {
    sqlite.prepare(`INSERT OR IGNORE INTO nodes (id,kind,title,content,body_blob_hash,created_at,updated_at)
      VALUES (?,'topic',?,?,?,?,?)`).run(id, id, texts.node, id === 'topic' ? nodeHash : null, at, at);
  }
  sqlite.prepare(`INSERT INTO node_sync_versions (version_id,object_id,host_name,created_at,
    content_hash,body_text,snapshot_json) VALUES ('old','topic','host',?,'old-hash',?,?)`)
    .run(at, texts.node, JSON.stringify({ content: texts.node, body_blob_hash: nodeHash }));
  sqlite.prepare("UPDATE nodes SET current_version_id = 'old' WHERE id = 'topic'").run();
  sqlite.prepare(`INSERT INTO node_sync_tombstones (node_id,version_id,host_name,content_hash,
    snapshot_json,deleted_at,created_at) VALUES ('proof','proof-version','host','proof-hash',?,?,?)`)
    .run(JSON.stringify({ content: texts.node }), at, at);
  sqlite.prepare(`INSERT INTO keep_import_item_cache (rule_id,source_path,title,content,
    source_mtime_ms,source_size_bytes,refreshed_at) VALUES ('rule','source.md','Cache',?,1,1,?)`)
    .run(texts.cache, at);
  const incoming = sqlite.prepare(`INSERT INTO incoming_updates (id,topic_id,source_type,source_path,
    updated_content,status,created_at,updated_at) VALUES (?,?,'markdown',? ,?,'pending',?,?)`);
  incoming.run('surviving', 'special-inbox', 'surviving.md', texts.incoming, at, at);
  incoming.run('discarded', 'topic', 'discarded.md', texts.discarded, at, at);
  sqlite.prepare(`INSERT INTO content_blobs (hash,storage_key,kind,mime_type,compression,
    original_size_bytes,stored_size_bytes,original_sha256,stored_sha256,availability,created_at)
    VALUES (?,'attachment/path','attachment','application/octet-stream','none',0,0,?,?,'local',?)`)
    .run('d'.repeat(64), 'd'.repeat(64), 'd'.repeat(64), at);
  return { sqlite, driver, db, nodeHash };
}

function assertBusinessReset(host: ReturnType<typeof fixture>) {
  expect(host.driver.queryAll<{ id: string }>('SELECT id FROM nodes ORDER BY id').map((row) => row.id))
    .toEqual(['special-inbox', 'special-virtual-root']);
  expect(host.driver.queryAll('SELECT * FROM node_sync_versions')).toEqual([]);
  expect(host.driver.queryAll('SELECT * FROM node_sync_tombstones')).toEqual([]);
  expect(host.driver.queryAll<{ id: string }>('SELECT id FROM incoming_updates').map((row) => row.id)).toEqual(['surviving']);
  expect(host.driver.queryAll('SELECT * FROM keep_import_item_cache')).toEqual([]);
  expect(host.driver.queryOne("SELECT hash FROM content_blobs WHERE kind = 'attachment'")).toBeUndefined();
}

it('preserves the original default continuous reset result', async () => {
  const host = fixture();
  expect(await host.db.transaction((tx) => clearWorkgroupSyncDataForRestore(tx, 'restore'))).toEqual(['topic']);
  assertBusinessReset(host);
  expect(host.driver.queryAll('SELECT * FROM content_blobs')).toEqual([]);
  expect(host.driver.queryAll('SELECT * FROM content_blob_data')).toEqual([]);
  expect(host.driver.queryOne('SELECT content FROM keep_import_item_cache')).toBeUndefined();
  expect(host.driver.queryOne<{ updated_content: string }>('SELECT updated_content FROM incoming_updates')?.updated_content)
    .toBe(texts.incoming);
});

it('keeps surviving owned text readable when obsolete body storage is absent', async () => {
  const host = fixture();
  host.sqlite.exec('DROP TABLE content_blob_data');
  expect(await host.db.transaction((tx) => clearWorkgroupSyncDataForRestore(tx, 'restore'))).toEqual(['topic']);
  assertBusinessReset(host);
  expect(host.driver.queryAll('SELECT * FROM content_blobs')).toEqual([]);
  expect(host.driver.queryOne<{ updated_content: string }>('SELECT updated_content FROM incoming_updates')?.updated_content)
    .toBe(texts.incoming);
  expect(host.driver.queryAll<{ content: string }>('SELECT content FROM nodes').map((row) => row.content))
    .toEqual([texts.node, texts.node]);
});
