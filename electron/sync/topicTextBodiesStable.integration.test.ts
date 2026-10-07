// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { loadTopicTextBody } from '../../lib/core/sync/topicTextBodies.js';
import type { TopicTextAlternative } from '../../lib/core/sync/topicTextState.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

function entry(body: string): TopicTextAlternative {
  return { id: 'alternative-1', body_blob_hash: hashTextBody(body), source_host_name: 'sender',
    created_at: '2026-10-01T00:00:00.000Z', expires_at: '2026-11-01T00:00:00.000Z' };
}

async function host(body: string, captureContinuous = false) {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  initializeDatabaseSchema(sqlite);
  upsertTextBodyBlob(createBetterSqlite3Driver(sqlite), body, 'now');
  const db = createBetterSqliteDbPort(sqlite);
  const selected = entry(body);
  const original = captureContinuous ? await loadTopicTextBody(db, selected) : null;
  await migrateBodyContentStorage(db);
  return { sqlite, db, selected, original };
}

it('preserves continuous and chunked empty, Unicode NUL and long alternative bodies after old data removal', async () => {
  for (const body of ['', '中文😀\0end', '中😀'.repeat(500_000)]) {
    const value = await host(body, true);
    value.sqlite.exec('DROP TABLE content_blob_data');
    expect(await loadTopicTextBody(value.db, value.selected, 'chunked')).toEqual(value.original);
    await expect(loadTopicTextBody(value.db, value.selected)).rejects.toThrow('content_blob_data');
  }
});

it('preserves the BOM in verified alternative text and validates its original hash', async () => {
  const body = '\ufeff中文\0😀';
  const value = await host(body);
  value.sqlite.exec('DROP TABLE content_blob_data');
  expect(await loadTopicTextBody(value.db, value.selected, 'chunked'))
    .toEqual({ hash: hashTextBody(body), text: body });
});

it('rejects absent and unverified stable headers without falling back to continuous data', async () => {
  const value = await host('Original');
  value.sqlite.exec('DROP TRIGGER content_bodies_immutable_update');
  value.sqlite.prepare('UPDATE content_bodies SET verified = 0 WHERE hash = ?').run(value.selected.body_blob_hash);
  value.sqlite.prepare('INSERT INTO content_blob_data (hash, data) VALUES (?, ?)')
    .run(value.selected.body_blob_hash, Buffer.from('Original'));
  await expect(loadTopicTextBody(value.db, value.selected, 'chunked'))
    .rejects.toThrow('text_alternative_body_unavailable:alternative-1');
  await expect(loadTopicTextBody(value.db, entry('Missing'), 'chunked'))
    .rejects.toThrow('text_alternative_body_unavailable:alternative-1');
  expect(await loadTopicTextBody(value.db, value.selected)).toEqual({ hash: value.selected.body_blob_hash, text: 'Original' });
});

it('retains the hash check for corrupted verified alternative bytes', async () => {
  const value = await host('Original');
  value.sqlite.exec('DROP TRIGGER content_body_chunks_immutable_update');
  value.sqlite.prepare('UPDATE content_body_chunks SET data = ? WHERE hash = ?')
    .run(Buffer.from('Tampered'), value.selected.body_blob_hash);
  await expect(loadTopicTextBody(value.db, value.selected, 'chunked'))
    .rejects.toThrow('text_alternative_body_hash_mismatch');
});
