// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { readBodyPartIds, readPartitionedNodeBody } from '../../lib/core/database/partitionedNodeBody.js';
import { TEXT_BODY_MAX_BYTES } from '../../lib/core/nodes/textBodyBudget.js';
import { openNodeSqliteFixture } from '../database/nodeSqliteFixture.testSupport.js';

import { runEpubImport } from './epubImport.js';
import { createTestZip } from './testZipBuilder.js';

vi.mock('electron', () => ({}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('./epubImportBook.js', async () => {
  const { buildRawEpubBook } = await import('./epubRawBookBuild.js');
  return { readRawEpubBook: (source: { filePath: string; sourceName: string }) =>
    buildRawEpubBook(source.filePath, source.sourceName, root) };
});

const NOW = '2026-10-08T00:00:00.000Z';
const LONG_CHAPTER = 'x'.repeat(TEXT_BODY_MAX_BYTES) + ' chapter end';
let connection: ReturnType<typeof openNodeSqliteFixture>;
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'foliole-epub-budget-'));
  connection = openNodeSqliteFixture();
});
afterEach(async () => {
  connection.sqlite.close();
  await rm(root, { recursive: true, force: true });
});

async function importBook(content: string) {
  const filePath = path.join(root, 'book.epub');
  const entries = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>',
    'book.opf': `<package xmlns:dc="http://purl.org/dc/elements/1.1/">
      <metadata><dc:title>Example book</dc:title></metadata>
      <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="chapter"/></spine></package>`,
    'chapter.xhtml': `<html><head><title>Example chapter</title></head><body><p>${content}</p></body></html>`
  };
  await writeFile(filePath, createTestZip(Object.entries(entries).map(([name, content]) =>
    ({ name, content, compression: 'store' }))));
  return runEpubImport({ adapterId: 'text_file', filePath, kind: 'epub', sourceName: 'book.epub' }, NOW);
}

it('imports a real EPUB with a complete oversized chapter stored in bounded parts', async () => {
  const { driver } = connection;
  const book = await importBook(LONG_CHAPTER);
  expect(book.resultStatus).toBe('imported');
  const chapter = driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE parent_id = ? AND title = ?',
    [book.nodeId!, 'Example chapter'])?.id;
  expect(chapter).toBeTruthy();
  expect(readBodyPartIds(driver, chapter!)).toHaveLength(2);
  const content = readPartitionedNodeBody(driver, chapter!);
  expect(content === '# Example chapter\n\n' + LONG_CHAPTER).toBe(true);
  expect(driver.queryOne('SELECT max(length(CAST(content AS BLOB))) AS bytes FROM nodes')?.bytes)
    .toBeLessThanOrEqual(TEXT_BODY_MAX_BYTES);
});

it('rolls back the book root and import records when chapter persistence fails', async () => {
  connection.sqlite.exec(`CREATE TRIGGER reject_chapter BEFORE INSERT ON nodes WHEN NEW.title = 'Example chapter'
    BEGIN SELECT RAISE(ABORT, 'fixture_chapter_failure'); END`);
  await expect(importBook('Chapter text.')).rejects.toThrow('fixture_chapter_failure');
  expect(connection.driver.queryOne("SELECT id FROM nodes WHERE title = 'Example book'")).toBeUndefined();
  expect(connection.driver.queryAll('SELECT id FROM import_runs')).toEqual([]);
});
