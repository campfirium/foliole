// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { readParentChildOrder } from '../../lib/core/database/parentChildOrder.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { buildReadwiseUnlocatedNodeId } from '../../lib/core/readwise/readwiseBookUnlocated.js';

import { placeReadwiseBookHighlights } from './readwiseBookHighlightPlacement.js';
import { preserveReadwiseBookExcerpts } from './readwiseBookReimportPreservation.js';
import { openReadwiseImportTestDatabase } from './readwiseImportSqlite.testSupport.js';

let database: ReturnType<typeof openReadwiseImportTestDatabase>;
let directory: string;

vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => database }));

beforeEach(async () => {
  database = openReadwiseImportTestDatabase();
  directory = await mkdtemp(path.join(os.tmpdir(), 'readwise-book-reset-'));
});

afterEach(async () => {
  database?.sqlite.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

const bookKey = 'book';
const rootNodeId = 'book-root';
const unlocatedId = buildReadwiseUnlocatedNodeId('local-books', bookKey);

function insertTopic(id: string, parent: string | null, content: string, anchor: string | null = null) {
  database.driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,anchor_link,created_at,updated_at)
    VALUES (?,?,'topic',?,1,?,?,'2026-01-01','2026-01-01')`, [id, parent, id, content, anchor]);
}

async function place(importedAt: string) {
  return placeReadwiseBookHighlights({
    bookKey, rootNodeId, importedAt, readwiseConfig: createDefaultReadwiseReaderConfig(),
    highlightMarkdownPath: path.join(directory, 'book.md')
  });
}

it('reattaches the same studied chapter excerpt after reset and leaves unrelated local excerpts in place', async () => {
  await writeFile(path.join(directory, 'book.md'), '# Book\n\n## Highlights\nSaved quote. [...] (https://example.com/1)\n');
  insertTopic(rootNodeId, null, 'Book');
  insertTopic('first-chapter', rootNodeId, 'Chapter starts. Saved quote. The chapter ends.');
  await expect(place('2026-01-02')).resolves.toEqual({ matchedCount: 1, unmatchedCount: 0 });
  const { driver } = database;
  const original = driver.queryOne<{ id: string; anchor_link: string }>(
    'SELECT id, anchor_link FROM nodes WHERE parent_id = ?', ['first-chapter'])!;
  driver.execute('INSERT INTO node_review (node_id, stability, due) VALUES (?, ?, ?)', [original.id, 12, '2026-02-01']);
  driver.execute('UPDATE nodes SET content = ? WHERE id = ?', ['My edited excerpt.', original.id]);
  insertTopic('local-excerpt', 'first-chapter', 'Saved quote.', '{"id":"local-anchor","kind":"highlight"}');
  driver.transaction(() => {
    preserveReadwiseBookExcerpts({ bookKey, driver, importedAt: '2026-01-03', rootNodeId });
    driver.execute('DELETE FROM nodes WHERE id = ?', ['first-chapter']);
  });
  expect(readParentChildOrder(driver, unlocatedId).childIds).toContain(original.id);
  insertTopic('new-chapter', rootNodeId, 'The new chapter starts. Saved quote. The chapter ends.');

  await expect(place('2026-01-04')).resolves.toEqual({ matchedCount: 1, unmatchedCount: 0 });
  expect(readParentChildOrder(driver, 'new-chapter').childIds).toEqual([original.id]);
  expect(readParentChildOrder(driver, unlocatedId).childIds).toEqual(['local-excerpt']);
  const row = driver.queryOne<{ anchor_link: string; content: string }>(
    'SELECT anchor_link, content FROM nodes WHERE id = ?', [original.id])!;
  expect(row.content).toBe('My edited excerpt.');
  expect(JSON.parse(row.anchor_link)).toMatchObject({
    id: JSON.parse(original.anchor_link).id, locator: { originalText: 'Saved quote.' }
  });
  expect(driver.queryOne('SELECT stability FROM node_review WHERE node_id = ?', [original.id])).toEqual({ stability: 12 });
});
