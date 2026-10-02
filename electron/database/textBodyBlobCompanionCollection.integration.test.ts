// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { ANDROID_COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionSchemaStatements.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { collectTextBodyBlobCandidatesWithPort } from '../../lib/core/database/textBodyBlobCollection.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it.each([['android', ANDROID_COMPANION_SCHEMA_STATEMENTS], ['ios', COMPANION_SCHEMA_STATEMENTS]] as const)('rechecks actual %s companion holders without desktop-only tables', async (_host, schema) => {
  const db = new Database(':memory:');
  try {
    for (const sql of schema) db.exec(sql);
    const driver = createBetterSqlite3Driver(db);
    const current = upsertTextBodyBlob(driver, 'Current companion body', 'now');
    const frozen = upsertTextBodyBlob(driver, 'In-flight companion body', 'now');
    const garbage = upsertTextBodyBlob(driver, 'Unused companion body', 'now');
    db.prepare(`INSERT INTO nodes (id,kind,title,body_blob_hash,created_at,updated_at)
      VALUES ('topic','topic','Article',?,'now','now')`).run(current);
    db.prepare(`INSERT INTO sync_pack_dependency_rows VALUES
      ('group','peer','view','node','object',0,'nodes','{}',?,'digest')`)
      .run(JSON.stringify({ keyed: { [frozen]: { status: 'pending' } } }));
    expect(await collectTextBodyBlobCandidatesWithPort(createBetterSqliteDbPort(db), [current, frozen, garbage]))
      .toEqual({ deletedHashes: [garbage], deletedBytes: Buffer.byteLength('Unused companion body') });
    expect(db.prepare('SELECT hash FROM content_blob_data ORDER BY hash').all())
      .toEqual([current, frozen].sort().map((hash) => ({ hash })));
  } finally { db.close(); }
});

it('ignores numeric array indexes while preserving actual string keys and values', async () => {
  const db = new Database(':memory:');
  try {
    for (const sql of COMPANION_SCHEMA_STATEMENTS) db.exec(sql);
    const driver = createBetterSqlite3Driver(db);
    const indexOnly = upsertTextBodyBlob(driver, '12', 'now');
    const stringKey = upsertTextBodyBlob(driver, '13', 'now');
    const stringValue = upsertTextBodyBlob(driver, '14', 'now');
    db.prepare(`INSERT INTO sync_pack_dependency_rows VALUES
      ('group','peer','view','node','object',0,'nodes','{}',?,'digest')`)
      .run(JSON.stringify({ list: Array.from({ length: 15 }, () => null), keyed: { '13': null }, value: '14' }));
    expect(await collectTextBodyBlobCandidatesWithPort(createBetterSqliteDbPort(db), [indexOnly, stringKey, stringValue]))
      .toEqual({ deletedHashes: [indexOnly], deletedBytes: 2 });
    expect(db.prepare('SELECT hash FROM content_blob_data ORDER BY hash').all())
      .toEqual([stringKey, stringValue].sort().map((hash) => ({ hash })));
  } finally { db.close(); }
});
