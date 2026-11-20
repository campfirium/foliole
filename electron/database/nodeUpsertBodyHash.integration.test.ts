// @vitest-environment node
import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

const hashing = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../lib/core/database/textBodyHash.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/core/database/textBodyHash.js')>();
  return { ...actual, hashTextBody: (content: string) => { hashing.calls++; return actual.hashTextBody(content); } };
});

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';

const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function fixture() {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  initializeDatabaseSchema(sqlite);
  const driver = createBetterSqlite3Driver(sqlite);
  sqlite.exec("INSERT INTO settings VALUES ('host_name', 'Test', 'now')");
  bindParentOrderWriter(driver, { deviceAnchor: 'test', libraryPath: '/test' });
  const save = (title: string, content: string) => upsertNodeSnapshot(driver, { nodeId: 'topic', kind: 'topic',
    parentNodeId: null, title, content, createdAt: '2026-01-01', updatedAt: '2026-11-20',
    isTitleManual: true, anchorLink: null, reveal: null, position: null });
  const stored = () => sqlite.prepare("SELECT title, content, body_blob_hash FROM nodes WHERE id = 'topic'").get() as {
    title: string; content: string; body_blob_hash: string };
  return { sqlite, save, stored };
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

it('keeps the stored body hash for a title-only save without hashing the body again', () => {
  const host = fixture();
  const body = 'Long article body '.repeat(1000);
  host.save('Topic', body);
  expect(host.stored().body_blob_hash).toBe(sha(body));

  hashing.calls = 0;
  host.save('Renamed topic', body);
  expect(hashing.calls).toBe(0);
  expect(host.stored()).toEqual({ title: 'Renamed topic', content: body, body_blob_hash: sha(body) });
});

it('hashes a changed body and a row without a stored hash', () => {
  const host = fixture();
  host.save('Topic', 'First body');
  hashing.calls = 0;
  host.save('Topic', 'Second body');
  expect(hashing.calls).toBe(1);
  expect(host.stored().body_blob_hash).toBe(sha('Second body'));

  host.sqlite.exec("UPDATE nodes SET body_blob_hash = NULL WHERE id = 'topic'");
  host.save('Topic', 'Second body');
  expect(host.stored().body_blob_hash).toBe(sha('Second body'));
});
