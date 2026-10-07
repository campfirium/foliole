// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { observeDriver } from '../../../electron/database/bodyContentDriver.testSupport.js';
import { textBranch } from '../../../electron/database/topicTextState.testSupport.js';

import { migrateBodyContentStorage } from './bodyContentMigration.js';
import { migrateBodyContentOwners } from './bodyContentOwnerMigration.js';
import { upsertTextBodyBlob } from './contentBodyBlobs.js';
import type { DatabaseRow, DatabaseBindParams } from './driver.js';
import { initializeDatabaseSchema } from './migrations.js';
import { writeNodeSyncTombstonesForPermanentDelete } from './nodeSyncTombstones.js';
import { loadVerifiedBodyRefWithDriver, readBodyTextWithDriver } from './verifiedBodyWithDriver.js';

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach((sqlite) => sqlite.close()));
const beforeAt = '2026-10-07T00:00:00.000Z';
const deletedAt = '2026-10-07T01:00:00.000Z';

function fixture(body: string, alreadyDeleted = false) {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  initializeDatabaseSchema(sqlite);
  const driver = createBetterSqlite3Driver(sqlite);
  const hash = upsertTextBodyBlob(driver, body, beforeAt);
  const record = textBranch('version', body, undefined, alreadyDeleted ? deletedAt : beforeAt);
  const snapshot = { ...record.snapshot, body_blob_hash: hash,
    deleted_at: alreadyDeleted ? deletedAt : null, resource_references: '[]',
    anchor_resolution_status: 'resolved', anchor_source_version_id: 'anchor-source' };
  sqlite.prepare(`INSERT INTO node_sync_versions (version_id, object_id, parent_version_id,
    host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('version','topic','parent','host',?,'original-hash',?,?)`).run(snapshot.updated_at, body, JSON.stringify(snapshot));
  sqlite.prepare(`INSERT INTO nodes (id,kind,title,content,body_blob_hash,current_version_id,created_at,updated_at)
    VALUES ('topic','topic','Topic','stale inline',?,'version',?,?)`).run(hash, beforeAt, snapshot.updated_at);
  return { sqlite, driver, hash };
}

async function migrate(host: ReturnType<typeof fixture>) {
  await createBetterSqliteDbPort(host.sqlite).transaction(async (tx) => {
    await migrateBodyContentStorage(tx);
    await migrateBodyContentOwners(tx, 'desktop');
  });
  host.sqlite.exec('DROP TABLE content_blob_data');
}

function observeTombstoneReads(host: ReturnType<typeof fixture>) {
  const reads = observeDriver(host.driver);
  return { ...reads, driver: { ...reads.driver,
    prepare(sql: string) {
      return { ...host.driver.prepare(sql),
        get: <T extends DatabaseRow>(params?: DatabaseBindParams) => reads.driver.queryOne<T>(sql, params),
        all: <T extends DatabaseRow>(params?: DatabaseBindParams) => reads.driver.queryAll<T>(sql, params)
      };
    }
  } };
}

function tombstone(host: ReturnType<typeof fixture>) {
  return host.driver.queryOne<{ version_id: string; parent_version_id: string; host_name: string;
    content_hash: string; snapshot_json: string; inline_body_hash?: string | null }>(
    "SELECT * FROM node_sync_tombstones WHERE node_id = 'topic'");
}

it.each(['', '\ufeff"\\\t\0中文😀\r\n'.repeat(250_000)])(
  'creates the same new deletion hash through bounded original body reads', async (body) => {
    const old = fixture(body);
    old.driver.transaction(() => writeNodeSyncTombstonesForPermanentDelete(old.driver, ['topic'], deletedAt));
    const expected = tombstone(old)!;
    const stable = fixture(body);
    await migrate(stable);
    const reads = observeTombstoneReads(stable);
    reads.driver.transaction(() => writeNodeSyncTombstonesForPermanentDelete(reads.driver, ['topic'], deletedAt, 'chunked'));
    const actual = tombstone(stable)!;
    expect(actual.content_hash).toBe(expected.content_hash);
    expect(actual.version_id).toBe(expected.version_id);
    expect(actual.parent_version_id).toBe(expected.parent_version_id);
    expect(actual.host_name).toBe(expected.host_name);
    expect(JSON.parse(actual.snapshot_json)).toEqual({ ...JSON.parse(expected.snapshot_json), content: null });
    expect(actual.inline_body_hash).toBe(stable.hash);
    expect(reads.sizes.every((size) => size <= 512 * 1024)).toBe(true);
    if (body.length) expect(reads.sizes.length).toBeGreaterThan(1);
    const ref = loadVerifiedBodyRefWithDriver(stable.driver, actual.inline_body_hash!)!;
    expect(readBodyTextWithDriver(stable.driver, ref)).toBe(body);
    expect(stable.driver.queryOne<{ content_hash: string }>("SELECT content_hash FROM sync_object_state WHERE object_id = 'topic'")?.content_hash)
      .toBe(expected.content_hash);
  }
);

it.each(['retired', 'unavailable'] as const)('preserves a same-timestamp %s proof without reading body bytes', async (state) => {
  const host = fixture('Original', true);
  await migrate(host);
  host.sqlite.prepare('UPDATE node_sync_versions SET body_state = ?').run(state);
  host.sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(host.hash);
  const reads = observeTombstoneReads(host);
  reads.driver.transaction(() => writeNodeSyncTombstonesForPermanentDelete(reads.driver, ['topic'], deletedAt, 'chunked'));
  expect(tombstone(host)).toMatchObject({ content_hash: 'original-hash', inline_body_hash: null });
  expect(reads.sizes).toEqual([]);
});

it('retains an existing body owner only for the same proof identity', async () => {
  const host = fixture('Original', true);
  await migrate(host);
  host.driver.transaction(() => writeNodeSyncTombstonesForPermanentDelete(host.driver, ['topic'], deletedAt, 'chunked'));
  host.sqlite.exec("UPDATE node_sync_versions SET body_state = 'retired'");
  host.driver.transaction(() => writeNodeSyncTombstonesForPermanentDelete(host.driver, ['topic'], deletedAt, 'chunked'));
  expect(tombstone(host)?.inline_body_hash).toBe(host.hash);
  host.sqlite.exec("UPDATE node_sync_tombstones SET version_id = 'other-version'");
  host.driver.transaction(() => writeNodeSyncTombstonesForPermanentDelete(host.driver, ['topic'], deletedAt, 'chunked'));
  expect(tombstone(host)?.inline_body_hash).toBeNull();
  host.sqlite.prepare('UPDATE node_sync_tombstones SET inline_body_hash = ?').run(host.hash);
  host.sqlite.exec("UPDATE node_sync_versions SET content_hash = 'different-proof'");
  host.driver.transaction(() => writeNodeSyncTombstonesForPermanentDelete(host.driver, ['topic'], deletedAt, 'chunked'));
  expect(tombstone(host)).toMatchObject({ content_hash: 'different-proof', inline_body_hash: null });
});

it.each(['retired', 'unavailable', 'missing_header', 'missing_chunk'] as const)('rejects a new deletion with %s before writing proof or state', async (state) => {
  const host = fixture('Original');
  await migrate(host);
  if (state === 'missing_header') host.sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(host.hash);
  else if (state === 'missing_chunk') {
    const header = host.driver.queryOne<{ byte_length: number; frontmatter_end: number | null; utf16_length: number }>(
      'SELECT byte_length, frontmatter_end, utf16_length FROM content_bodies WHERE hash = ?', [host.hash])!;
    host.sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(host.hash);
    host.sqlite.prepare(`INSERT INTO content_bodies (hash,byte_length,verified,frontmatter_end,utf16_length)
      VALUES (?, ?, 1, ?, ?)`).run(host.hash, header.byte_length, header.frontmatter_end, header.utf16_length);
  }
  else host.sqlite.prepare('UPDATE node_sync_versions SET body_state = ?').run(state);
  const before = host.driver.queryAll('SELECT * FROM sync_object_state');
  expect(() => host.driver.transaction(() => writeNodeSyncTombstonesForPermanentDelete(host.driver, ['topic'], deletedAt, 'chunked')))
    .toThrow('body_content_unavailable');
  expect(tombstone(host)).toBeUndefined();
  expect(host.driver.queryAll('SELECT * FROM sync_object_state')).toEqual(before);
  expect(host.driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id = 'topic'")?.content).toBe('');
});
