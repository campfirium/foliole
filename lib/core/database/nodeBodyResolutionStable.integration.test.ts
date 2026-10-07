// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { observeDriver } from '../../../electron/database/bodyContentDriver.testSupport.js';

import { migrateBodyContentStorage } from './bodyContentMigration.js';
import { upsertTextBodyBlob } from './contentBodyBlobs.js';
import { initializeDatabaseSchema } from './migrations.js';
import { loadNodeBodyResolution, NodeBodyUnavailableError } from './nodeBodyResolution.js';
import { loadNodeBodyResolutionWithPort } from './nodeBodyResolutionWithPort.js';

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

function host() {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  initializeDatabaseSchema(sqlite);
  return { sqlite, driver: createBetterSqlite3Driver(sqlite), db: createBetterSqliteDbPort(sqlite) };
}

it('preserves migrated single-article body text, hash and resolution shape in both adapters', async () => {
  const value = host();
  const bodies = ['', '\uFEFF中文\0body😀', `${'中😀'.repeat(500_000)}\uFEFFtail`];
  const original = bodies.map((body, index) => {
    const id = `node-${index}`;
    const hash = upsertTextBodyBlob(value.driver, body, 'now');
    value.sqlite.prepare(`INSERT INTO nodes (id,kind,content,body_blob_hash,title,created_at,updated_at)
      VALUES (?, 'topic', 'Stale inline must not win', ?, 'Title', 'now', 'now')`).run(id, hash);
    return loadNodeBodyResolution(value.driver, id);
  });
  await migrateBodyContentStorage(value.db);
  const reads = observeDriver(value.driver);
  for (const [index, expected] of original.entries()) {
    expect(loadNodeBodyResolution(reads.driver, `node-${index}`, 'chunked')).toEqual(expected);
    expect(await loadNodeBodyResolutionWithPort(value.db, `node-${index}`, 'chunked')).toEqual(expected);
  }
  expect(Math.max(...reads.sizes)).toBeLessThanOrEqual(512 * 1024);
  expect(loadNodeBodyResolution(value.driver, 'missing', 'chunked')).toBeNull();
  expect(await loadNodeBodyResolutionWithPort(value.db, 'missing', 'chunked')).toBeNull();
});

it('returns unavailable for missing verified headers and refuses inline fallback for missing stable identities', async () => {
  const value = host();
  const hash = upsertTextBodyBlob(value.driver, 'Original', 'now');
  value.sqlite.prepare(`INSERT INTO nodes (id,kind,content,body_blob_hash,title,created_at,updated_at)
    VALUES ('node', 'topic', 'Inline', ?, 'Title', 'now', 'now')`).run(hash);
  await migrateBodyContentStorage(value.db);
  value.sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(hash);
  const unavailable = { bodyBlobHash: hash, status: 'unavailable' };
  expect(loadNodeBodyResolution(value.driver, 'node', 'chunked')).toEqual(unavailable);
  expect(await loadNodeBodyResolutionWithPort(value.db, 'node', 'chunked')).toEqual(unavailable);
  value.sqlite.exec("UPDATE nodes SET body_blob_hash = NULL, content = 'Inline' WHERE id = 'node'");
  expect(() => loadNodeBodyResolution(value.driver, 'node', 'chunked')).toThrow(NodeBodyUnavailableError);
  await expect(loadNodeBodyResolutionWithPort(value.db, 'node', 'chunked')).rejects.toThrow(NodeBodyUnavailableError);
  expect(loadNodeBodyResolution(value.driver, 'node')).toEqual({ bodyBlobHash: null, content: 'Inline',
    source: 'legacy_inline', status: 'resolved' });
});

it('fails against an explicitly absent stable schema instead of detecting or falling back to inline content', async () => {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT, body_blob_hash TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
    INSERT INTO nodes VALUES ('node','Inline','${'a'.repeat(64)}')`);
  const driver = createBetterSqlite3Driver(sqlite);
  expect(() => loadNodeBodyResolution(driver, 'node', 'chunked')).toThrow('no such table: content_bodies');
  await expect(loadNodeBodyResolutionWithPort(createBetterSqliteDbPort(sqlite), 'node', 'chunked'))
    .rejects.toThrow('no such table: content_bodies');
});
