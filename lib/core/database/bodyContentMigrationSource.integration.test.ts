// @vitest-environment node
import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';

import { bodyMigrationSourceChunks, bodyMigrationSourceHash } from './bodyContentMigrationSource.js';
import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';
import { DESKTOP_CORE_SCHEMA_STATEMENTS } from './desktopCoreSchemaStatements.js';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from './desktopResourceSchemaStatements.js';
import { EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS } from './externalDocumentSchemaStatements.js';
import { KEEP_IMPORT_SCHEMA_STATEMENTS } from './keepImportSchemaStatements.js';

const sources = [
  ['tombstone', 'node_sync_tombstones', 'snapshot_json'],
  ['conflict', 'node_sync_conflicts', 'snapshot_json'],
  ['alternative', 'node_text_alternatives', 'body_text'],
  ['external', 'external_documents', 'content'],
  ['incoming', 'incoming_updates', 'updated_content'],
  ['import_cache', 'keep_import_item_cache', 'content']
] as const;
const statements = [...DESKTOP_CORE_SCHEMA_STATEMENTS, ...DESKTOP_RESOURCE_SCHEMA_STATEMENTS,
  ...EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS, ...KEEP_IMPORT_SCHEMA_STATEMENTS];

function fixture(table: string, column: string, body: string) {
  const sqlite = new Database(':memory:');
  sqlite.exec(DESKTOP_CORE_SCHEMA_STATEMENTS[0]!);
  sqlite.prepare("INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('fixture', 'Fixture', 'then', 'then')").run();
  sqlite.exec(statements.find((sql) => sql.includes(`CREATE TABLE IF NOT EXISTS ${table} (`))!);
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; type: string }>;
  const payload = column === 'snapshot_json' ? JSON.stringify({ content: body, title: 'Metadata' }) : body;
  sqlite.prepare(`INSERT INTO ${table} (${columns.map((item) => item.name).join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map((item) =>
    item.name === column ? payload : item.type === 'INTEGER' ? 0 : 'fixture'));
  return { sqlite, db: createBetterSqliteDbPort(sqlite) };
}

it.each(sources)('reads original %s bytes and hash with bounded chunks', async (kind, table, column) => {
  const body = '\ufeff' + '中😀\0文'.repeat(310_000);
  const bytes = Buffer.from(body);
  expect(bytes.byteLength).toBeGreaterThan(3 * 1024 * 1024);
  const { sqlite, db } = fixture(table, column, body);
  try {
    let offset = 0;
    for await (const chunk of bodyMigrationSourceChunks(db, { kind, rowid: 1 }, bytes.byteLength)) {
      expect(chunk.byteLength).toBeLessThanOrEqual(BODY_CONTENT_CHUNK_BYTES);
      expect(Buffer.from(chunk)).toEqual(bytes.subarray(offset, offset + chunk.byteLength));
      offset += chunk.byteLength;
    }
    expect(offset).toBe(bytes.byteLength);
    expect(await bodyMigrationSourceHash(db, { kind, rowid: 1 }, bytes.byteLength))
      .toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(sqlite.prepare(`SELECT ${column} AS body FROM ${table}`).get())
      .toEqual({ body: column === 'snapshot_json' ? JSON.stringify({ content: body, title: 'Metadata' }) : body });
    await expect(bodyMigrationSourceHash(db, { kind, rowid: 2 }, 1))
      .rejects.toThrow('body_migration_source_unavailable');
    await expect(bodyMigrationSourceHash(db, { kind, rowid: 1 }, bytes.byteLength + 1))
      .rejects.toThrow('body_migration_source_unavailable');
  } finally { sqlite.close(); }
});

it.each(sources.slice(0, 2))('rejects non-text %s snapshot contents', async (kind, table, column) => {
  const { sqlite, db } = fixture(table, column, 'Original');
  try {
    for (const content of [null, 1, {}, []]) {
      sqlite.prepare(`UPDATE ${table} SET snapshot_json = ?`).run(JSON.stringify({ content }));
      await expect(bodyMigrationSourceHash(db, { kind, rowid: 1 }, 1))
        .rejects.toThrow('body_migration_source_unavailable');
    }
  } finally { sqlite.close(); }
});
