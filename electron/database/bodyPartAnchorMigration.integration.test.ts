// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { readBodyPartIds, readPartitionedNodeBody } from '../../lib/core/database/partitionedNodeBody.js';
import { expandPartitionedNodeForImport, partitionStoredNodeBody } from '../../lib/core/database/partitionedNodeBodyMutation.js';
import { TEXT_BODY_MAX_BYTES } from '../../lib/core/nodes/textBodyBudget.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const opened: Database.Database[] = [];
afterEach(() => opened.splice(0).forEach(db => db.close()));
const BODY = '雪😀\r\n'.repeat(150_000);
const NOW = '2026-10-09T00:00:00.000Z';
const grouped = [{ from: 10, to: 20 }, { from: 650_000, to: 650_010 }];
const oversized = [{ from: 10, to: 700_000 }];
const whole = [{ from: 570_000, to: 570_010 }, { from: 590_000, to: 590_010 }];

function fixture(companion: boolean, ranges: Array<{ from: number; to: number }>, quoted = false) {
  const sqlite = new Database(':memory:');
  opened.push(sqlite);
  if (companion) sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  else initializeDatabaseSchema(sqlite);
  const anchor = JSON.stringify({ id: 'original-anchor', kind: 'highlight', locator: ranges.length > 1 ?
    { ranges: ranges.map(range => ({ ...range, originalText: BODY.slice(range.from, range.to) })) } :
    { ...ranges[0], originalText: BODY.slice(ranges[0]!.from, ranges[0]!.to) } });
  const insert = sqlite.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, anchor_link,
    current_version_id, created_at, updated_at, sync_dirty) VALUES (?, ?, 'topic', ?, ?, ?, NULL, ?, ?, 1)`);
  insert.run('topic', null, 'Original source', BODY, null, NOW, NOW);
  insert.run('annotation', 'topic', 'Original highlight', quoted ? BODY.slice(10, 700_000) : 'Quote', anchor, NOW, NOW);
  sqlite.exec(`INSERT INTO parent_child_order VALUES ('topic', '["annotation"]', '${NOW}')`);
  sqlite.pragma(`user_version = ${companion ? 78 : 149}`);
  return { sqlite, driver: createBetterSqlite3Driver(sqlite), db: createBetterSqliteDbPort(sqlite), anchor };
}
async function upgrade(host: ReturnType<typeof fixture>, companion: boolean) {
  if (companion) await host.db.transaction(tx => migrateCompanionDatabase(tx, 78, 79));
  else initializeDatabaseSchema(host.sqlite);
}

it.each([false, true])('migrates a valid grouped anchor across parts without changing its identity companion=%s', async companion => {
  const host = fixture(companion, grouped);
  await upgrade(host, companion);
  expect(readPartitionedNodeBody(host.driver, 'topic')).toBe(BODY);
  expect(host.sqlite.prepare("SELECT parent_id, anchor_link FROM nodes WHERE id='annotation'").get())
    .toEqual({ parent_id: 'topic', anchor_link: host.anchor });

});

it.each([false, true])('migrates oversized child content while preserving its original anchor identity companion=%s', async companion => {
  const host = fixture(companion, oversized, true);
  await upgrade(host, companion);
  expect(readPartitionedNodeBody(host.driver, 'annotation')).toBe(BODY.slice(10, 700_000));
  expect(readBodyPartIds(host.driver, 'annotation').length).toBeGreaterThan(1);
  expect(host.sqlite.prepare("SELECT parent_id, anchor_link FROM nodes WHERE id='annotation'").get())
    .toEqual({ parent_id: 'topic', anchor_link: host.anchor });
  expect(host.sqlite.prepare('SELECT count(*) FROM nodes WHERE anchor_link IS NOT NULL').pluck().get()).toBe(1);
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(companion ? 79 : 150);
});

it.each([false, true])('keeps a bounded grouped highlight whole by adjusting the split boundary companion=%s', async companion => {
  const host = fixture(companion, whole);
  await upgrade(host, companion);
  const row = host.sqlite.prepare("SELECT parent_id, anchor_link FROM nodes WHERE id='annotation'").get() as {
    parent_id: string; anchor_link: string };
  expect(readBodyPartIds(host.driver, 'topic')).toContain(row.parent_id);
  const body = host.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get(row.parent_id) as string;
  const parsed = parseStoredAnchorLink(row.anchor_link);
  if (!parsed?.locator || !('ranges' in parsed.locator)) throw new Error('fixture_grouped_anchor_missing');
  for (const range of parsed.locator.ranges) expect(body.slice(range.from, range.to)).toBe(range.originalText);
  expect(Buffer.byteLength(body)).toBeLessThanOrEqual(TEXT_BODY_MAX_BYTES);
  expect(readPartitionedNodeBody(host.driver, 'topic')).toBe(BODY);
});

it.each([false, true])('preserves a valid non-text formula anchor while migrating its oversized source companion=%s', async companion => {
  const host = fixture(companion, oversized);
  const rect = { x: 0, y: 0, width: 1, height: 1 };
  const anchor = JSON.stringify({ id: 'original-anchor', kind: 'highlight', locator: {
    kind: 'formula-region', display: 'block', formulaSource: 'x', occurrenceKey: 'formula-0', fallbackRect: rect,
    selection: { algorithm: 'katex-dom-leaf-v1', fallbackRect: rect,
      leaves: [{ path: [0], structureFingerprint: 'structure', textFingerprint: 'x' }] } } });
  expect(parseStoredAnchorLink(anchor)).not.toBeNull();
  host.sqlite.prepare("UPDATE nodes SET anchor_link=? WHERE id='annotation'").run(anchor);
  await upgrade(host, companion);
  expect(host.sqlite.prepare("SELECT parent_id, anchor_link FROM nodes WHERE id='annotation'").get())
    .toEqual({ parent_id: 'topic', anchor_link: anchor });
  expect(readPartitionedNodeBody(host.driver, 'topic')).toBe(BODY);
  if (!companion) host.driver.transaction(tx => {
    expandPartitionedNodeForImport(tx, 'topic', NOW);
    partitionStoredNodeBody(tx, 'topic', NOW);
  });
  expect(host.sqlite.prepare("SELECT parent_id, anchor_link FROM nodes WHERE id='annotation'").get())
    .toEqual({ parent_id: 'topic', anchor_link: anchor });
});

it('expands and repartitions source-owned cross-part anchors without changing identity', async () => {
  for (const ranges of [grouped, oversized]) {
    const host = fixture(false, ranges);
    await upgrade(host, false);
    host.driver.transaction(tx => {
      expandPartitionedNodeForImport(tx, 'topic', NOW);
      expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='topic'").pluck().get()).toBe(BODY);
      partitionStoredNodeBody(tx, 'topic', NOW);
    });
    expect(readPartitionedNodeBody(host.driver, 'topic')).toBe(BODY);
    expect(host.sqlite.prepare("SELECT parent_id, anchor_link FROM nodes WHERE id='annotation'").get())
      .toEqual({ parent_id: 'topic', anchor_link: host.anchor });
    expect(host.sqlite.prepare('SELECT count(*) FROM nodes WHERE anchor_link IS NOT NULL').pluck().get()).toBe(1);
  }
});


it.each([false, true])('migrates an ordinary oversized child under its short parent without changing hierarchy or metadata companion=%s', async companion => {
  const host = fixture(companion, grouped);
  host.sqlite.prepare("UPDATE nodes SET content='Short parent' WHERE id='topic'").run();
  const storageKey = `${'a'.repeat(64)}.png`;
  host.sqlite.prepare(`UPDATE nodes SET id='ordinary-child', title='Original child title', is_title_manual=1,
    content=?, anchor_link=NULL, image_sources=?, resource_references=? WHERE id='annotation'`)
    .run(BODY, JSON.stringify({ [storageKey]: 'https://example.test/image.png' }),
      JSON.stringify([{ storage_key: storageKey, role: 'image', original_name: 'Original.png' }]));
  host.sqlite.exec(`DELETE FROM parent_child_order;
    INSERT INTO parent_child_order VALUES ('topic', '["ordinary-child"]', '${NOW}')`);
  const metadata = () => host.sqlite.prepare(`SELECT id,parent_id,kind,title,is_title_manual,image_sources,
    resource_references,anchor_link,created_at FROM nodes WHERE id='ordinary-child'`).get();
  const original = metadata();
  await upgrade(host, companion);
  expect(metadata()).toEqual(original);
  expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='topic'").pluck().get()).toBe('Short parent');
  expect(readBodyPartIds(host.driver, 'topic')).toEqual([]);
  expect(readPartitionedNodeBody(host.driver, 'ordinary-child')).toBe(BODY);
  const parts = readBodyPartIds(host.driver, 'ordinary-child');
  expect(parts.length).toBeGreaterThan(1);
  for (const id of parts) {
    const row = host.sqlite.prepare('SELECT parent_id,content FROM nodes WHERE id=?').get(id) as {
      parent_id: string; content: string };
    expect(row.parent_id).toBe('ordinary-child');
    expect(Buffer.byteLength(row.content, 'utf8')).toBeLessThanOrEqual(TEXT_BODY_MAX_BYTES);
  }
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(companion ? 79 : 150);
});
