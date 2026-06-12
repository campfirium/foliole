// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-epub-import-same-file-fragments-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { listNodeAttachments } from '../database/attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { runEpubImport } from './epubImport.js';
import { createTestZip } from './testZipBuilder.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-import-same-file-fragments-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function writeEpub(entries: Array<{ content: string | Uint8Array; name: string }>) {
  const filePath = path.join(tempRoot, 'same-file-fragments.epub');
  await fs.writeFile(filePath, createTestZip(entries.map((entry) => ({ ...entry, compression: 'store' as const }))));
  return filePath;
}

function createFragmentBookEntries(input: {
  body: string;
  extraEntries?: Array<{ content: string | Uint8Array; name: string }>;
  manifestExtra?: string;
  navPoints: string;
  spineExtra?: string;
}) {
  return [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content: '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        `<?xml version="1.0"?><package version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Fragment Book</dc:title></metadata><manifest><item id="book" href="text/book.xhtml" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>${input.manifestExtra ?? ''}</manifest><spine toc="ncx"><itemref idref="book"${input.spineExtra ?? ''}/></spine></package>`,
      name: 'OPS/book.opf'
    },
    { content: `<ncx><navMap>${input.navPoints}</navMap></ncx>`, name: 'OPS/toc.ncx' },
    { content: `<html><head><title>Combined</title></head><body>${input.body}</body></html>`, name: 'OPS/text/book.xhtml' },
    ...(input.extraEntries ?? [])
  ];
}

function navPoint(title: string, fragment: string) {
  return `<navPoint><navLabel><text>${title}</text></navLabel><content src="text/book.xhtml#${fragment}"/></navPoint>`;
}

function readImportedChildren(parentNodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT id, title, content FROM nodes WHERE parent_id = ? ORDER BY title ASC')
    .all(parentNodeId) as Array<{ content: string; id: string; title: string }>;
}

it('imports same-file ncx fragment chapters as separate readable sections', async () => {
  const filePath = await writeEpub(createFragmentBookEntries({
    body: '<h1 id="chapter-1">Chapter 1</h1><p>First body.</p><h1 id="chapter-2">Chapter 2</h1><p>Second body.</p>',
    navPoints: `${navPoint('Chapter 1', 'chapter-1')}${navPoint('Chapter 2', 'chapter-2')}`
  }));

  const imported = await runEpubImport(
    { adapterId: 'text_file', filePath, kind: 'epub', sourceName: path.basename(filePath) },
    '2026-04-01T12:01:00.000Z'
  );

  expect(readImportedChildren(imported.nodeId as string)).toEqual([
    expect.objectContaining({ content: '# Chapter 1\n\nFirst body.', title: 'Chapter 1' }),
    expect.objectContaining({ content: '# Chapter 2\n\nSecond body.', title: 'Chapter 2' })
  ]);
});

it('keeps embedded images attached to their own fragment section only', async () => {
  const filePath = await writeEpub(createFragmentBookEntries({
    body:
      '<h1 id="chapter-1">Chapter 1</h1><p>First body.</p><img src="../images/one.jpeg" alt="One"/>' +
      '<h1 id="chapter-2">Chapter 2</h1><p>Second body.</p><img src="../images/two.jpeg" alt="Two"/>',
    extraEntries: [
      { content: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), name: 'OPS/images/one.jpeg' },
      { content: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]), name: 'OPS/images/two.jpeg' }
    ],
    manifestExtra:
      '<item id="one" href="images/one.jpeg" media-type="image/jpeg"/><item id="two" href="images/two.jpeg" media-type="image/jpeg"/>',
    navPoints: `${navPoint('Chapter 1', 'chapter-1')}${navPoint('Chapter 2', 'chapter-2')}`
  }));

  const imported = await runEpubImport(
    { adapterId: 'text_file', filePath, kind: 'epub', sourceName: path.basename(filePath) },
    '2026-04-01T12:05:00.000Z'
  );
  const children = readImportedChildren(imported.nodeId as string);

  expect(listNodeAttachments(children[0]?.id ?? '').map((entry) => entry.attachment.originalName)).toEqual(['one.jpeg']);
  expect(listNodeAttachments(children[1]?.id ?? '').map((entry) => entry.attachment.originalName)).toEqual(['two.jpeg']);
});

it('handles name and inline anchors while reporting missing and duplicate fragments', async () => {
  const filePath = await writeEpub(createFragmentBookEntries({
    body:
      '<h1><a name="named-anchor"></a>Named Chapter</h1><p>Named body.</p>' +
      '<p>Inline preface <span id="inline-anchor">Inline Chapter</span> inline body.</p>' +
      '<h1 id="duplicate-anchor">Duplicate Chapter</h1><p>First duplicate body.</p>' +
      '<h1 id="duplicate-anchor">Duplicate Later</h1><p>Second duplicate body.</p>',
    navPoints:
      `${navPoint('Named Chapter', 'named-anchor')}${navPoint('Inline Chapter', 'inline-anchor')}` +
      `${navPoint('Duplicate Chapter', 'duplicate-anchor')}${navPoint('Missing Chapter', 'missing-anchor')}`
  }));

  const imported = await runEpubImport(
    { adapterId: 'text_file', filePath, kind: 'epub', sourceName: path.basename(filePath) },
    '2026-04-01T12:02:00.000Z'
  );
  const children = readImportedChildren(imported.nodeId as string);

  expect(children.find((child) => child.title === 'Named Chapter')?.content).toContain('Named body.');
  expect(children.find((child) => child.title === 'Inline Chapter')?.content).toContain('Inline preface');
  expect(imported.resultStatus).toBe('degraded');
  expect(imported.degradedReason).toContain('EPUB TOC fragment matched multiple anchors');
  expect(imported.degradedReason).toContain('EPUB TOC fragment could not be matched');
});

it('marks structural health failures degraded instead of reporting silent success', async () => {
  const filePath = await writeEpub(createFragmentBookEntries({
    body: '<h1 id="only">Only Body</h1><p>All content is here.</p>',
    navPoints: `${navPoint('Only Body', 'only')}${navPoint('Missing 1', 'missing-1')}${navPoint('Missing 2', 'missing-2')}${navPoint('Missing 3', 'missing-3')}`
  }));

  const imported = await runEpubImport(
    { adapterId: 'text_file', filePath, kind: 'epub', sourceName: path.basename(filePath) },
    '2026-04-01T12:03:00.000Z'
  );

  expect(imported.resultStatus).toBe('degraded');
  expect(imported.degradedReason).toContain('sections are empty');
});

it('reports toc targets that point to non-linear spine items', async () => {
  const filePath = await writeEpub(createFragmentBookEntries({
    body: '<h1 id="only">Only Body</h1><p>Hidden body.</p>',
    navPoints: navPoint('Only Body', 'only'),
    spineExtra: ' linear="no"'
  }));

  const imported = await runEpubImport(
    { adapterId: 'text_file', filePath, kind: 'epub', sourceName: path.basename(filePath) },
    '2026-04-01T12:04:00.000Z'
  );

  expect(imported.resultStatus).toBe('degraded');
  expect(imported.degradedReason).toContain('EPUB TOC target is non-linear spine item');
});
