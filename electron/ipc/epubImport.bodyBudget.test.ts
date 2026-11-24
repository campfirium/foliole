// @vitest-environment node
import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { readBodyPartIds, readPartitionedNodeBody } from '../../lib/core/database/partitionedNodeBody.js';
import { TEXT_BODY_MAX_BYTES } from '../../lib/core/nodes/textBodyBudget.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';
import { openNodeSqliteFixture } from '../database/nodeSqliteFixture.testSupport.js';

import { runEpubImport } from './epubImport.js';
import { createTestZip } from './testZipBuilder.js';

vi.mock('electron', () => ({}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => {
    if (++ownerCalls === 2) await beforeFinalOwner?.();
    return execute();
  }
}));
vi.mock('./epubImportBook.js', async () => {
  const { EpubArchiveEntries } = await import('./epubArchiveEntries.js');
  const { buildRawEpubBook } = await import('./epubRawBookBuild.js');
  return { readRawEpubBook: async (source: { filePath: string; sourceName: string }) => {
    const stage = await mkdtemp(path.join(root, 'stage-'));
    const book = await buildRawEpubBook(source.filePath, source.sourceName, stage);
    if (book.nodes.some(node => node.embeddedImages.length)) {
      await (await EpubArchiveEntries.open(source.filePath, stage)).extract('photo.jpg');
    }
    book.workingDirectory = stage;
    book.dispose = async () => { rmSync(stage, { recursive: true, force: true }); };
    return book;
  } };
});

const NOW = '2026-10-08T00:00:00.000Z';
const LONG_CHAPTER = 'x'.repeat(TEXT_BODY_MAX_BYTES) + ' chapter end';
const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);
let connection: ReturnType<typeof openNodeSqliteFixture>;
let root: string;
let ownerCalls: number;
let beforeFinalOwner: (() => Promise<void>) | undefined;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'foliole-epub-budget-'));
  connection = openNodeSqliteFixture();
  publishAttachmentLibraryPathSnapshot({ assetsDir: path.join(root, 'assets'), libraryScope: 'epub-test' });
  ownerCalls = 0;
  beforeFinalOwner = undefined;
});
afterEach(async () => {
  clearAttachmentLibraryPathSnapshot();
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
      <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
      <item id="image" href="photo.jpg" media-type="image/jpeg"/></manifest>
      <spine><itemref idref="chapter"/></spine></package>`,
    'chapter.xhtml': `<html><head><title>Example chapter</title></head><body><p>${content}</p></body></html>`,
    'photo.jpg': JPEG
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

it('keeps staged chapter text available while final persistence waits for the database owner', async () => {
  const queued = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  beforeFinalOwner = async () => { queued.resolve(); await release.promise; };
  const pending = importBook(LONG_CHAPTER);
  await Promise.race([queued.promise, pending.then(() => { throw new Error('Final write did not queue'); })]);
  release.resolve();
  const book = await pending;
  expect(book.resultStatus).toBe('imported');
  expect(connection.driver.queryOne<{ opening_text: string }>(
    'SELECT opening_text FROM nodes WHERE parent_id = ? AND title = ?', [book.nodeId!, 'Example chapter']
  )?.opening_text).toContain('xxxxxxxx');
});

it('keeps an inline embedded image readable when its asset URL overlaps the chapter byte limit', async () => {
  const heading = '# Example chapter\n\n';
  const prefix = 'x'.repeat(TEXT_BODY_MAX_BYTES - heading.length - 12);
  const book = await importBook(`${prefix}<img src="photo.jpg" alt="Cover"/> chapter end`);
  expect(book.resultStatus).toBe('imported');
  const { driver } = connection;
  const chapter = driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE parent_id = ? AND title = ?',
    [book.nodeId!, 'Example chapter'])!.id;
  const parts = readBodyPartIds(driver, chapter).map(id => readPartitionedNodeBody(driver, id));
  const storageKey = `${createHash('sha256').update(JPEG).digest('hex')}.jpg`;
  const image = `![Cover](asset://${storageKey})`;
  expect(parts).toHaveLength(2);
  expect(parts.join('') === `${heading}${prefix}${image} chapter end`).toBe(true);
  expect(parts.some(content => content.includes(image))).toBe(true);
  await expect(resolveAttachmentFile(storageKey)).resolves.toMatchObject({ status: 'ready', mimeType: 'image/jpeg' });
});
