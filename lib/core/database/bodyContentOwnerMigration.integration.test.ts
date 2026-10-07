// @vitest-environment node
import { expect, it } from 'vitest';

import { observeReads } from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import { textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { loadVerifiedBodyRef, readBodyText } from '../sync/verifiedBody.js';

import { migrateBodyContentStorage } from './bodyContentMigration.js';
import { migrateBodyContentOwners } from './bodyContentOwnerMigration.js';
import { hashTextBody } from './textBodyHash.js';

const owners = [
  ['node_sync_tombstones', 'snapshot_json', 'inline_body_hash'],
  ['node_sync_conflicts', 'snapshot_json', 'inline_body_hash'],
  ['node_text_alternatives', 'body_text', 'body_blob_hash'],
  ['external_documents', 'content', 'body_blob_hash'],
  ['incoming_updates', 'updated_content', 'body_blob_hash'],
  ['keep_import_item_cache', 'content', 'body_blob_hash']
] as const;
const timestamp = '2026-10-07T00:00:00.000Z';

function seed(body: string) {
  const host = textDevice();
  host.sqlite.prepare("INSERT INTO nodes (id, kind, title, content, created_at, updated_at) VALUES ('fixture', 'topic', 'Fixture', '', ?, ?)")
    .run(timestamp, timestamp);
  for (const [table, column] of owners) {
    const fields = host.sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; type: string }>;
    host.sqlite.prepare(`INSERT INTO ${table} (${fields.map((field) => field.name).join(',')})
      VALUES (${fields.map(() => '?').join(',')})`).run(...fields.map((field) => {
      if (field.name === column) return column === 'snapshot_json'
        ? JSON.stringify({ content: body, body_blob_hash: 'original-projection', title: 'Metadata' }) : body;
      if (field.name === 'body_blob_hash') return null;
      if (field.name === 'content_hash') return 'object-identity';
      if (field.type === 'INTEGER' || field.type === 'REAL') return 0;
      return field.name.endsWith('_at') ? timestamp : 'fixture';
    }));
  }
  return host;
}

it.each(['', '\ufeff中😀\0文'.repeat(300000)])('adopts every explicit body holder without altering metadata identities', async (body) => {
  const host = seed(body);
  try {
    const reads = observeReads(host.db);
    await reads.port.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await migrateBodyContentOwners(tx, 'desktop');
    });
    const digest = hashTextBody(body);
    for (const [table, column, hashColumn] of owners) {
      const row = host.sqlite.prepare(`SELECT ${column} AS body, ${hashColumn} AS hash FROM ${table}`).get() as {
        body: string | null; hash: string;
      };
      expect(row.hash).toBe(digest);
      if (column === 'snapshot_json') expect(JSON.parse(row.body!))
        .toEqual({ content: null, body_blob_hash: 'original-projection', title: 'Metadata' });
      else expect(row.body).toBe(table === 'keep_import_item_cache' ? null : '');
    }
    expect(host.sqlite.prepare('SELECT content_hash FROM external_documents').get()).toEqual({ content_hash: 'object-identity' });
    const ref = await loadVerifiedBodyRef(host.db, digest);
    expect(ref).not.toBeNull();
    expect(await readBodyText(host.db, ref!)).toBe(body);
    expect(Math.max(0, ...reads.sizes)).toBeLessThanOrEqual(512 * 1024);
    expect(host.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});

it('rolls back all holder updates and the body schema when the final owner cannot adopt', async () => {
  const host = seed('Original body');
  try {
    const original = owners.map(([table]) => host.sqlite.prepare(`SELECT * FROM ${table}`).all());
    host.sqlite.exec(`CREATE TRIGGER reject_cache_owner BEFORE UPDATE ON keep_import_item_cache
      BEGIN SELECT RAISE(ABORT, 'cache_owner_unavailable'); END`);
    await expect(host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await migrateBodyContentOwners(tx, 'desktop');
    })).rejects.toThrow('cache_owner_unavailable');
    expect(owners.map(([table]) => host.sqlite.prepare(`SELECT * FROM ${table}`).all())).toEqual(original);
    expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'content_bodies'").get()).toBeUndefined();
    host.sqlite.exec('DROP TRIGGER reject_cache_owner');
    await host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await migrateBodyContentOwners(tx, 'desktop');
    });
    expect(host.sqlite.prepare('SELECT body_blob_hash FROM keep_import_item_cache').pluck().get()).toBe(hashTextBody('Original body'));
  } finally { host.sqlite.close(); }
});

it('keeps absent cache contents and an unavailable external body distinct from readable empty text', async () => {
  const host = seed('');
  try {
    const missing = 'f'.repeat(64);
    host.sqlite.prepare('UPDATE keep_import_item_cache SET content = NULL').run();
    host.sqlite.prepare('UPDATE external_documents SET body_blob_hash = ?').run(missing);
    await host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await migrateBodyContentOwners(tx, 'desktop');
    });
    expect(host.sqlite.prepare('SELECT content, body_blob_hash FROM keep_import_item_cache').get())
      .toEqual({ content: null, body_blob_hash: null });
    expect(host.sqlite.prepare('SELECT content, body_blob_hash FROM external_documents').get())
      .toEqual({ content: '', body_blob_hash: missing });
    expect(await loadVerifiedBodyRef(host.db, missing)).toBeNull();
    expect((await loadVerifiedBodyRef(host.db, hashTextBody('')))?.byteLength).toBe(0);
  } finally { host.sqlite.close(); }
});

it('rejects a contradictory existing external identity and preserves its original inline text', async () => {
  const host = seed('Original external body');
  try {
    const other = hashTextBody('Different body');
    host.sqlite.prepare('UPDATE external_documents SET body_blob_hash = ?').run(other);
    await expect(host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await migrateBodyContentOwners(tx, 'desktop');
    })).rejects.toThrow('body_migration_owner_hash_mismatch');
    expect(host.sqlite.prepare('SELECT content, body_blob_hash FROM external_documents').get())
      .toEqual({ content: 'Original external body', body_blob_hash: other });
    expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'content_bodies'").get()).toBeUndefined();
  } finally { host.sqlite.close(); }
});
