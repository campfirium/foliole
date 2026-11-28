// @vitest-environment node
import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { readBodyPartIds, readPartitionedNodeBody } from '../../lib/core/database/partitionedNodeBody.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { resolveAttachmentFile, resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { openNodeSqliteFixture } from '../database/nodeSqliteFixture.testSupport.js';
import { prepareOriginalEpubCandidate } from '../import/readwiseOriginalEpubPreparation.js';

import { runEpubImport } from './epubImport.js';
import { createTestZip } from './testZipBuilder.js';

vi.mock('electron', () => ({}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('./epubImportBook.js', async () => {
  const { EpubArchiveEntries } = await import('./epubArchiveEntries.js');
  const { buildRawEpubBook } = await import('./epubRawBookBuild.js');
  return { readRawEpubBook: async (source: { filePath: string; sourceName: string }) => {
    const stage = await mkdtemp(path.join(root, 'stage-'));
    const book = await buildRawEpubBook(source.filePath, source.sourceName, stage);
    if (book.nodes.some(node => node.content.includes('photo.jpg'))) {
      await (await EpubArchiveEntries.open(source.filePath, stage)).extract('photo.jpg');
    }
    book.workingDirectory = stage;
    book.dispose = async () => { rmSync(stage, { recursive: true, force: true }); };
    return book;
  } };
});

const SMALL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yZB8AAAAASUVORK5CYII=', 'base64');
const BIG_PNG = Buffer.concat([SMALL_PNG, Buffer.alloc(1_500_000, 1)]);
const WRAPPED_PNG = Buffer.concat([SMALL_PNG, Buffer.from([2])]);
const url = (bytes: Buffer) => `data:image/png;base64,${bytes.toString('base64')}`;
const key = (bytes: Buffer) => `${createHash('sha256').update(bytes).digest('hex')}.png`;
const BROKEN = 'data:image/png;base64,cG5n';
const PHOTO = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);

let connection: ReturnType<typeof openNodeSqliteFixture>;
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'foliole-epub-data-'));
  connection = openNodeSqliteFixture();
  publishAttachmentLibraryPathSnapshot({ assetsDir: path.join(root, 'assets'), libraryScope: 'epub-test' });
});
afterEach(async () => {
  clearAttachmentLibraryPathSnapshot();
  connection.sqlite.close();
  await rm(root, { recursive: true, force: true });
});

async function writeBook(body: string, cover?: string) {
  const filePath = path.join(root, 'book.epub');
  const entries = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>',
    'book.opf': `<package xmlns:dc="http://purl.org/dc/elements/1.1/">
      <metadata><dc:title>Example book</dc:title></metadata>
      <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
      <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
      <item id="photo" href="photo.jpg" media-type="image/jpeg"/></manifest>
      <spine>${cover ? '<itemref idref="cover"/>' : ''}<itemref idref="chapter"/></spine></package>`,
    'cover.xhtml': `<html><head><title>Cover</title></head><body>${cover ?? ''}</body></html>`,
    'photo.jpg': PHOTO,
    'chapter.xhtml': `<html><head><title>Example chapter</title></head><body>${body}</body></html>`
  };
  await writeFile(filePath, createTestZip(Object.entries(entries).map(([name, content]) =>
    ({ name, content, compression: 'store' }))));
  return filePath;
}

const wrapped = url(WRAPPED_PNG).replace(/.{40}/g, '$&\n');
const BODY = `<p>Before</p><p><img src="${url(BIG_PNG)}" alt="Big"/></p><p><img src="${wrapped}" alt="Wrapped"/></p>` +
  `<p><svg><image href="${url(SMALL_PNG)}"/></svg></p><p>After</p>`;

function chapterOf(bookId: string) {
  return connection.driver.queryOne<{ id: string; resource_references: string }>(
    "SELECT id, resource_references FROM nodes WHERE parent_id = ? AND title = 'Example chapter'", [bookId])!;
}
const body = (id: string) => readBodyPartIds(connection.driver, id).length
  ? readBodyPartIds(connection.driver, id).map(part => readPartitionedNodeBody(connection.driver, part)).join('')
  : readPartitionedNodeBody(connection.driver, id);

it('stores inline chapter images as attachments without splitting the chapter', async () => {
  const filePath = await writeBook(`${BODY}<p><img src="photo.jpg" alt="Packaged"/></p>`);
  const imported = await runEpubImport({ adapterId: 'text_file', filePath, kind: 'epub', sourceName: 'book.epub' },
    '2026-11-28T00:00:00.000Z');
  expect(imported.resultStatus).toBe('imported');
  expect(imported.degradedReason).toBeNull();
  const chapter = chapterOf(imported.nodeId!);
  expect(readBodyPartIds(connection.driver, chapter.id)).toEqual([]);
  const content = body(chapter.id);
  expect(content).toContain(`![Big](asset://${key(BIG_PNG)})`);
  expect(content).toContain(`![Wrapped](asset://${key(WRAPPED_PNG)})`);
  expect(content).toContain(`](asset://${key(SMALL_PNG)})`);
  expect(content).not.toContain('base64');
  expect(content).not.toContain('EPUB image not imported');
  const photoKey = `${createHash('sha256').update(PHOTO).digest('hex')}.jpg`;
  expect(content).toContain(`![Packaged](asset://${photoKey})`);
  const keys = [...[BIG_PNG, WRAPPED_PNG, SMALL_PNG].map(key), photoKey].sort();
  expect(JSON.parse(chapter.resource_references).map((row: { storage_key: string }) => row.storage_key).sort()).toEqual(keys);
  expect(await readFile(resolveAttachmentStoragePath(key(BIG_PNG).slice(0, 64), undefined, 'image/png'))).toEqual(BIG_PNG);
  await expect(resolveAttachmentFile(key(BIG_PNG))).resolves.toMatchObject({ status: 'ready' });
});

it('keeps an unreadable inline image and reports the book as degraded', async () => {
  const filePath = await writeBook(`<p>Text</p><p><img src="${BROKEN}" alt="Broken"/></p>`);
  const imported = await runEpubImport({ adapterId: 'text_file', filePath, kind: 'epub', sourceName: 'book.epub' },
    '2026-11-28T00:00:00.000Z');
  expect(imported.resultStatus).toBe('degraded');
  expect(imported.degradedReason).toBe('Inline images kept as text data: 1');
  expect(body(chapterOf(imported.nodeId!).id)).toContain(`![Broken](${BROKEN})`);
});

it('stages inline images for an original EPUB replacement', async () => {
  const filePath = await writeBook(BODY);
  const candidate = await prepareOriginalEpubCandidate({ filePath, now: '2026-11-28T00:00:00.000Z', title: 'Example book' });
  const section = candidate.images.sections[0]!;
  expect(section.content).toContain(`![Big](asset://${key(BIG_PNG)})`);
  expect(section.content).not.toContain('base64');
  expect(section.resourceReferences).toHaveLength(3);
  expect(candidate.stages).toHaveLength(3);
});

it('attaches an inline cover image to the book topic', async () => {
  const filePath = await writeBook('<p>Chapter text.</p>', `<p><img src="${url(BIG_PNG)}" alt="Front"/></p>`);
  const imported = await runEpubImport({ adapterId: 'text_file', filePath, kind: 'epub', sourceName: 'book.epub' },
    '2026-11-28T00:00:00.000Z');
  expect(body(imported.nodeId!)).toContain(`![Front](asset://${key(BIG_PNG)})`);
  expect(connection.driver.queryOne<{ resource_references: string }>(
    'SELECT resource_references FROM nodes WHERE id = ?', [imported.nodeId!])!.resource_references).toContain(key(BIG_PNG));
});
