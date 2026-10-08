// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { materializeCurrentVersionBodyBlobs } from '../../lib/core/sync/currentVersionBodyBlob.js';
import type { DbRow } from '../../lib/core/sync/dbPort.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { bodyState, seedCurrentBody } from './currentVersionBodyBlob.testSupport.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function database() {
  const db = new Database(':memory:');
  databases.push(db);
  return db;
}

it.each(['多字节\r\nbody\u0000end', '', 'e\u0301\né'])('materializes exact UTF-8 bytes without changing facts: %j', async (body) => {
  const db = database();
  const data = seedCurrentBody(db, body);
  const before = bodyState(db);
  const port = createBetterSqliteDbPort(db);
  await port.transaction((tx) => materializeCurrentVersionBodyBlobs(tx, { incomingAlias: 'inc' }));
  const after = bodyState(db);
  expect(after.bytes).toEqual([{ hash: data.hash, data: data.bytes }]);
  expect(after.nodes).toEqual(before.nodes);
  expect(after.versions).toEqual(before.versions);
  expect(after.state).toEqual(before.state);
  expect(after.blobs[0]).toMatchObject({ availability: 'cached', hash: data.hash });
  await port.transaction((tx) => materializeCurrentVersionBodyBlobs(tx, { incomingAlias: 'inc' }));
  expect(bodyState(db)).toEqual(after);
});

it.each([
  "UPDATE content_blobs SET stored_size_bytes = stored_size_bytes + 1",
  "UPDATE content_blobs SET original_size_bytes = original_size_bytes + 1",
  "UPDATE content_blobs SET stored_sha256 = 'bad'",
  "UPDATE content_blobs SET original_sha256 = 'bad'",
  "UPDATE content_blobs SET compression = 'gzip'",
  "UPDATE content_blobs SET kind = 'pdf'",
  "UPDATE content_blobs SET mime_type = 'text/markdown'",
  "UPDATE node_sync_versions SET body_text = 'wrong'",
  "UPDATE node_sync_versions SET body_text = NULL, snapshot_json = json_set(snapshot_json, '$.content', NULL)",
  "UPDATE node_sync_versions SET body_text = NULL, snapshot_json = json_remove(snapshot_json, '$.content')",
  "INSERT INTO nodes (id, kind, title, created_at, updated_at) VALUES ('other', 'topic', 'Other', 'now', 'now'); UPDATE node_sync_versions SET object_id = 'other'",
  "UPDATE node_sync_versions SET snapshot_json = json_set(snapshot_json, '$.id', 'other')",
  "UPDATE node_sync_versions SET snapshot_json = json_set(snapshot_json, '$.content', '', '$.body_blob_hash', 'other')",
  "UPDATE node_sync_versions SET snapshot_json = json_set(snapshot_json, '$.content', 'conflicting', '$.body_blob_hash', (SELECT hash FROM content_blobs LIMIT 1))",
  "UPDATE sync_object_state SET current_version_id = 'other'",
  "UPDATE sync_object_state SET content_hash = 'other'",
  "UPDATE nodes SET deleted_at = 'now'",
  "DELETE FROM inc.nodes"
])('keeps ineligible data missing and preserves every fact: %s', async (mutation) => {
  const db = database();
  seedCurrentBody(db);
  db.exec(mutation);
  const before = bodyState(db);
  const port = createBetterSqliteDbPort(db);
  await port.transaction((tx) => materializeCurrentVersionBodyBlobs(tx, { incomingAlias: 'inc' }));
  expect(bodyState(db)).toEqual(before);
});

it('uses an explicitly retained snapshot body, but never a recovered default', async () => {
  const db = database();
  const { bytes, hash } = seedCurrentBody(db);
  db.exec('UPDATE node_sync_versions SET body_text = NULL');
  const port = createBetterSqliteDbPort(db);
  await port.transaction((tx) => materializeCurrentVersionBodyBlobs(tx, { hashes: [hash] }));
  expect(db.prepare('SELECT data FROM content_blob_data').pluck().get()).toEqual(bytes);
});

it('rejects equal-length corrupted bytes instead of replacing the declared hash', async () => {
  const db = database();
  seedCurrentBody(db, 'abc');
  db.exec(`UPDATE node_sync_versions SET body_text = 'abd',
    snapshot_json = json_set(snapshot_json, '$.content', 'abd')`);
  const before = bodyState(db);
  const port = createBetterSqliteDbPort(db);
  await port.transaction((tx) => materializeCurrentVersionBodyBlobs(tx, { incomingAlias: 'inc' }));
  expect(bodyState(db)).toEqual(before);
});

it('rolls bytes and availability back when the caller fails after materializing', async () => {
  const db = database();
  const { hash } = seedCurrentBody(db);
  const before = bodyState(db);
  const port = createBetterSqliteDbPort(db);
  await expect(port.transaction(async (tx) => {
    expect(await materializeCurrentVersionBodyBlobs(tx, { hashes: [hash] })).toBe(1);
    throw new Error('simulated_apply_failure');
  })).rejects.toThrow('simulated_apply_failure');
  expect(bodyState(db)).toEqual(before);
});

it('materializes large original bodies in SQLite without returning them whole to JavaScript', async () => {
  const db = database();
  const { hash } = seedCurrentBody(db, 'x'.repeat(2 * 1024 * 1024 + 1));
  const port = createBetterSqliteDbPort(db);
  const query = port.query.bind(port);
  port.query = async <T extends DbRow>(sql: string, params = [] as Parameters<typeof query>[1]) => {
    const rows = await query<T>(sql, params);
    expect(rows.some((row) => typeof row.body === 'string')).toBe(false);
    return rows;
  };
  await port.transaction((tx) => materializeCurrentVersionBodyBlobs(tx, { hashes: [hash] }));
  expect(db.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(1);
  expect(db.prepare('SELECT length(data) FROM content_blob_data').pluck().get()).toBe(2 * 1024 * 1024 + 1);
});

it('caches the production version while preserving its complete node and version text', async () => {
  const db = database();
  const { bytes, hash } = seedCurrentBody(db);
  db.prepare('INSERT INTO content_blob_data VALUES (?, ?)').run(hash, bytes);
  db.prepare("UPDATE nodes SET content = ?, sync_dirty = 1 WHERE id = 'article'").run(bytes.toString());
  const versionId = flushNodeSyncVersionWithDriver(createBetterSqlite3Driver(db), 'article', 'source');
  const version = db.prepare('SELECT body_text, snapshot_json FROM node_sync_versions WHERE version_id=?')
    .get(versionId) as { body_text: string; snapshot_json: string };
  expect(version.body_text).toBe(bytes.toString());
  expect(JSON.parse(version.snapshot_json)).toMatchObject({ content: '', body_blob_hash: hash });
  db.prepare('DELETE FROM content_blob_data WHERE hash=?').run(hash);
  db.exec("UPDATE content_blobs SET availability = 'missing'");
  const before = bodyState(db);
  const port = createBetterSqliteDbPort(db);
  await port.transaction((tx) => materializeCurrentVersionBodyBlobs(tx, { incomingAlias: 'inc' }));
  const after = bodyState(db);
  expect(after.bytes).toEqual([{ hash, data: bytes }]);
  expect(after.nodes).toEqual(before.nodes);
  expect(after.versions).toEqual(before.versions);
  expect(after.state).toEqual(before.state);
});
