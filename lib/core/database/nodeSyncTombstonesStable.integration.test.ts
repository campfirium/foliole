// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { textBranch } from '../../../electron/database/topicTextState.testSupport.js';

import { initializeDatabaseSchema } from './migrations.js';
import { writeNodeSyncTombstonesForPermanentDelete } from './nodeSyncTombstones.js';
import { hashTextBody } from './textBodyHash.js';

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach((sqlite) => sqlite.close()));
const beforeAt = '2026-10-07T00:00:00.000Z';
const deletedAt = '2026-10-07T01:00:00.000Z';

function fixture(body: string, compact: boolean, alreadyDeleted = false) {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  initializeDatabaseSchema(sqlite);
  sqlite.exec('DROP TABLE content_blob_data');
  const driver = createBetterSqlite3Driver(sqlite);
  const record = textBranch('version', body, undefined, alreadyDeleted ? deletedAt : beforeAt);
  const snapshot = { ...record.snapshot, content: compact ? '' : body, body_blob_hash: hashTextBody(body),
    deleted_at: alreadyDeleted ? deletedAt : null };
  sqlite.prepare(`INSERT INTO node_sync_versions (version_id, object_id, parent_version_id,
    host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('version','topic','parent','host',?,'original-hash',?,?)`).run(snapshot.updated_at, body, JSON.stringify(snapshot));
  sqlite.prepare(`INSERT INTO nodes (id,kind,title,content,body_blob_hash,current_version_id,created_at,updated_at)
    VALUES ('topic','topic','Topic',? ,?,'version',?,?)`).run(body, hashTextBody(body), beforeAt, snapshot.updated_at);
  const write = () => driver.transaction(() => writeNodeSyncTombstonesForPermanentDelete(driver, ['topic'], deletedAt));
  const read = () => driver.queryOne<{ content_hash: string; snapshot_json: string }>(
    "SELECT * FROM node_sync_tombstones WHERE node_id = 'topic'");
  return { sqlite, driver, write, read };
}

it.each(['', '\ufeff"\\\t\0中文😀\r\n'.repeat(30000)])(
  'preserves original deletion text, identity and hash from complete version owners with compact snapshots', (body) => {
    const full = fixture(body, false), compact = fixture(body, true);
    full.write(); compact.write();
    expect(compact.read()).toEqual(full.read());
    expect(JSON.parse(compact.read()!.snapshot_json).content).toBe(body);
    expect(compact.driver.queryAll('SELECT * FROM sync_object_state')).toEqual(full.driver.queryAll('SELECT * FROM sync_object_state'));
  });

it('preserves the same existing deletion proof and is idempotent after cache retirement', () => {
  const host = fixture('Original', true, true);
  host.write();
  const proof = host.read();
  expect(proof?.content_hash).toBe('original-hash');
  expect(JSON.parse(proof!.snapshot_json).content).toBe('Original');
  host.write();
  expect(host.read()).toEqual(proof);
});

it('rejects a new deletion without retained text and rolls back proof and shared state', () => {
  const host = fixture('Original', true);
  host.sqlite.exec("UPDATE node_sync_versions SET body_text = NULL, snapshot_json = json_set(snapshot_json, '$.content', NULL)");
  const before = host.driver.queryAll('SELECT * FROM sync_object_state');
  expect(host.write).toThrow('sync_node_version_body_unavailable');
  expect(host.read()).toBeUndefined();
  expect(host.driver.queryAll('SELECT * FROM sync_object_state')).toEqual(before);
});
