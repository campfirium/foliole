// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_QUERY_DEFINITIONS } from '../../lib/core/database/androidCompanionQueryDefinitions.js';
import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { readSchemaShape, restorePreLocalDerivedIndexSchema } from './localDerivedIndexMigration.testSupport.js';

// The phone PDF search before the owner index, kept verbatim as the reference.
const mountKey = "json_extract(resource.value, '$.storage_key')";
const ORIGINAL_OWNER_FILTER = `attachment_id IN (SELECT substr(${mountKey}, 1, 64)
  FROM nodes owner, json_each(owner.resource_references) resource
  WHERE EXISTS (SELECT 1 FROM pdf_page_text WHERE instr(lower(text), ?) > 0)
    AND owner.deleted_at IS NULL
    AND json_extract(resource.value, '$.role') = 'reference'
    AND substr(${mountKey}, 65) = '.pdf')`;
const SEARCH = ANDROID_COMPANION_QUERY_DEFINITIONS.pdfPageTextSearch.sql;
const ORIGINAL_SEARCH = SEARCH.replace(/EXISTS \(SELECT 1 FROM pdf_attachment_nodes[\s\S]*?IS NULL\)/u, ORIGINAL_OWNER_FILTER);
const V082_LIBRARY = path.resolve('electron/database/fixtures/companion-android-v0.8.2/library.sql');
const NEW_OBJECTS = "SELECT type, name FROM sqlite_master WHERE name LIKE 'pdf_attachment_nodes%' OR name LIKE 'idx_pdf_attachment%'";

const opened: Database.Database[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const sqlite of opened.splice(0)) sqlite.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function file() {
  fs.mkdirSync(path.resolve('.tmp/artifacts'), { recursive: true });
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/schema-129-'));
  roots.push(root);
  return new Database(path.join(root, 'library.db'));
}

async function open(sqlite = file(), allowCreate = true) {
  opened.push(sqlite);
  await bootstrapCompanionDatabase(createBetterSqliteDbPort(sqlite), {
    allowCreate, expectedHostName: 'phone', now: '2026-11-26T00:00:00Z'
  });
  return sqlite;
}

function restoreVersion128(sqlite: Database.Database) {
  for (const { type, name } of sqlite.prepare(NEW_OBJECTS).all() as { type: string; name: string }[]) {
    sqlite.exec(`DROP ${type.toUpperCase()} IF EXISTS ${name}`);
  }
  restorePreLocalDerivedIndexSchema(sqlite, 128);
}

const pdf = (letter: string) => `${letter.repeat(64)}.pdf`;
const refs = (...items: [string, string][]) =>
  JSON.stringify(items.map(([key, role]) => ({ storage_key: key, role, original_name: 'x.pdf' })));

function seedPdfOwners(sqlite: Database.Database) {
  const node = sqlite.prepare(`INSERT INTO nodes (id, title, resource_references, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, 'now', 'now', ?)`);
  node.run('live', 'Live', refs([pdf('a'), 'reference'], [pdf('c'), 'reference'], [pdf('a'), 'reference']), null);
  node.run('trashed', 'Trashed', refs([pdf('b'), 'reference'], [pdf('c'), 'reference']), 'then');
  node.run('image-only', 'Image', refs([pdf('e'), 'image'], [`${'f'.repeat(64)}.png`, 'reference']), null);
  node.run('gone', 'Gone', refs([pdf('g'), 'reference']), null);
  const page = sqlite.prepare('INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height) VALUES (?, ?, ?, 1, 1)');
  for (const letter of 'abcdefg') for (const at of [1, 2]) page.run(letter.repeat(64), at, `Page ${at} keyword ${letter}`);
}

function search(sqlite: Database.Database, sql: string, needle: string) {
  const count = (sql.match(/\?/gu) ?? []).length;
  return sqlite.prepare(sql).all(...Array<string>(count - 1).fill(needle), 100);
}

async function upgradeLargeLibrary() {
  const sqlite = await open();
  restoreVersion128(sqlite);
  const node = sqlite.prepare(`INSERT INTO nodes (id, title, resource_references, created_at, updated_at)
    VALUES (?, ?, ?, 'now', 'now')`);
  const count = 50_000;
  sqlite.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      const key = `${index.toString(16).padStart(64, '0')}.pdf`;
      node.run(`n${index}`, `n${index}`, index % 10 === 0 ? refs([key, 'reference']) : '[]');
    }
  })();
  const started = performance.now();
  await open(sqlite, false);
  const elapsed = performance.now() - started;
  expect(sqlite.prepare('SELECT count(*) FROM pdf_attachment_nodes').pluck().get()).toBe(count / 10);
  expect(elapsed).toBeLessThan(5_000);
}

describe('phone local derived indexes (schema 129)', () => {
  it('upgrades a 128 library to the same shape a new library gets, and repeats cleanly', async () => {
    expect(COMPANION_DATABASE_VERSION).toBe(129);
    const fresh = await open();
    const upgraded = await open();
    restoreVersion128(upgraded);
    await open(upgraded, false);
    expect(upgraded.pragma('user_version', { simple: true })).toBe(129);
    expect(readSchemaShape(upgraded)).toEqual(readSchemaShape(fresh));
    await open(upgraded, false);
    expect(readSchemaShape(upgraded)).toEqual(readSchemaShape(fresh));
  });

  it('backfills PDF owners and answers PDF search row for row as before', async () => {
    const sqlite = await open();
    restoreVersion128(sqlite);
    seedPdfOwners(sqlite);
    await open(sqlite, false);
    expect(ORIGINAL_SEARCH).not.toBe(SEARCH);
    sqlite.exec("DELETE FROM nodes WHERE id = 'gone'");
    expect(sqlite.prepare("SELECT count(*) FROM pdf_attachment_nodes WHERE node_id = 'gone'").pluck().get()).toBe(0);
    for (const needle of ['keyword', 'page 2', 'keyword c', 'missing']) {
      expect(search(sqlite, SEARCH, needle)).toEqual(search(sqlite, ORIGINAL_SEARCH, needle));
    }
    expect(search(sqlite, SEARCH, 'keyword').map(row => (row as { attachment_id: string }).attachment_id[0]))
      .toEqual(['a', 'a', 'c', 'c']);
    sqlite.exec(`UPDATE nodes SET deleted_at = NULL WHERE id = 'trashed';
      UPDATE nodes SET resource_references = '[]' WHERE id = 'live'`);
    expect(search(sqlite, SEARCH, 'keyword')).toEqual(search(sqlite, ORIGINAL_SEARCH, 'keyword'));
  });

  it('upgrades a released v0.8.2 phone library through the new step', async () => {
    const sqlite = file();
    sqlite.exec(fs.readFileSync(V082_LIBRARY, 'utf8'));
    sqlite.pragma('user_version = 117');
    sqlite.prepare(`INSERT INTO nodes (id, title, resource_references, created_at, updated_at)
      VALUES ('pdf-topic', 'PDF', ?, 'now', 'now')`).run(refs([pdf('a'), 'reference']));
    await open(sqlite, false);
    expect(sqlite.prepare('SELECT storage_key, node_id FROM pdf_attachment_nodes').all())
      .toEqual([{ storage_key: pdf('a'), node_id: 'pdf-topic' }]);
    const fresh = await open();
    const ours = (shape: ReturnType<typeof readSchemaShape>) => shape.filter(({ name }) =>
      /^(daily_flow_dirty|daily_flow_node_re|daily_flow_state$|pdf_attachment_nodes|idx_pdf_attachment)/u.test(name));
    expect(ours(readSchemaShape(sqlite))).toEqual(ours(readSchemaShape(fresh)));
  });

  it('backfills a large phone library within the upgrade budget', { meta: { calibratedMs: 20_000 } }, upgradeLargeLibrary);
});
