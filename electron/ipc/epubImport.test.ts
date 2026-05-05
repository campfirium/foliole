// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-epub-import-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-import-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function writeEpub(fileName: string, entries: Array<{ content: string | Uint8Array; name: string }>) {
  const filePath = path.join(tempRoot, fileName);
  await fs.writeFile(filePath, createTestZip(entries.map((entry) => ({ ...entry, compression: 'store' as const }))));
  return filePath;
}

function source(filePath: string) {
  return { adapterId: 'text_file' as const, filePath, kind: 'epub' as const, sourceName: path.basename(filePath) };
}

function readImportedChildren(parentNodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT n.title, n.content
       FROM nodes n
       JOIN node_order o ON o.node_id = n.id
       WHERE n.parent_id = ?
       ORDER BY o.position ASC`
    )
    .all(parentNodeId) as Array<{ content: string; title: string }>;
}

it('imports chapters in spine order and uses page title before first heading', async () => {
  const filePath = await writeEpub('ordered.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Sample Book</dc:title></metadata><manifest><item id="later" href="text/later.xhtml" media-type="application/xhtml+xml"/><item id="first" href="text/first.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="first"/><itemref idref="later"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content: '<html><head><title>Page First</title></head><body><h1>Body First</h1><p>First spine body.</p></body></html>',
      name: 'OPS/text/first.xhtml'
    },
    {
      content: '<html><body><h1>Fallback Heading</h1><p>Second spine body.</p></body></html>',
      name: 'OPS/text/later.xhtml'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-01T12:00:00.000Z');
  const children = readImportedChildren(imported.nodeId as string);

  expect(imported.resultStatus).toBe('imported');
  expect(children.map((child) => child.title)).toEqual(['Page First', 'Fallback Heading']);
  expect(children[0]?.content).toContain('First spine body.');
  expect(children[1]?.content).toContain('Second spine body.');
});

it('skips nav documents and guide-marked cover pages during epub chapter import', async () => {
  const filePath = await writeEpub('skip-nav-and-cover.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Sample Book</dc:title></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="nav"/><itemref idref="cover"/><itemref idref="chapter"/></spine><guide><reference type="cover" title="Cover" href="cover.xhtml"/></guide></package>',
      name: 'OPS/book.opf'
    },
    {
      content: '<html><head><title>Contents</title></head><body><nav><ol><li><a href="text/chapter.xhtml">Chapter 1</a></li></ol></nav></body></html>',
      name: 'OPS/nav.xhtml'
    },
    {
      content: '<html><head><title>Cover</title></head><body><img src="images/cover.png" alt="Cover"/></body></html>',
      name: 'OPS/cover.xhtml'
    },
    {
      content: '<html><head><title>Real Chapter</title></head><body><h1>Real Chapter</h1><p>Hello world.</p></body></html>',
      name: 'OPS/text/chapter.xhtml'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-01T12:03:00.000Z');
  const children = readImportedChildren(imported.nodeId as string);

  expect(children).toHaveLength(1);
  expect(children[0]).toEqual({
    content: '# Real Chapter\n\nHello world.',
    title: 'Real Chapter'
  });
});

it('uses body headings when generic page titles would otherwise produce unknown chapter names', async () => {
  const filePath = await writeEpub('generic-title.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Sample Book</dc:title></metadata><manifest><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content: '<html><head><title>未知</title></head><body><h2>Actual Heading</h2><p>Hello world.</p></body></html>',
      name: 'OPS/text/chapter.xhtml'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-01T12:04:00.000Z');
  const children = readImportedChildren(imported.nodeId as string);

  expect(children).toHaveLength(1);
  expect(children[0]).toEqual({
    content: '## Actual Heading\n\nHello world.',
    title: 'Actual Heading'
  });
});

it('skips toc-like chapters even when the epub does not mark them as nav documents', async () => {
  const filePath = await writeEpub('toc-like.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Sample Book</dc:title></metadata><manifest><item id="toc" href="text/toc.xhtml" media-type="application/xhtml+xml"/><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="toc"/><itemref idref="chapter"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content:
        '<html><head><title>Contents</title></head><body><h2>目录</h2><p><a href="chapter.xhtml#c1">One</a></p><p><a href="chapter.xhtml#c2">Two</a></p><p><a href="chapter.xhtml#c3">Three</a></p><p><a href="chapter.xhtml#c4">Four</a></p><p><a href="chapter.xhtml#c5">Five</a></p></body></html>',
      name: 'OPS/text/toc.xhtml'
    },
    {
      content: '<html><head><title>未知</title></head><body><h1>Real Chapter</h1><p>Hello world.</p></body></html>',
      name: 'OPS/text/chapter.xhtml'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-01T12:06:00.000Z');
  const children = readImportedChildren(imported.nodeId as string);

  expect(children).toHaveLength(1);
  expect(children[0]).toEqual({
    content: '# Real Chapter\n\nHello world.',
    title: 'Real Chapter'
  });
});

it('fails with a readable reason when the package entry is missing', async () => {
  const filePath = await writeEpub('missing-container.epub', [{ content: 'application/epub+zip', name: 'mimetype' }]);
  await expect(runEpubImport(source(filePath), '2026-04-01T12:05:00.000Z')).rejects.toThrow(
    'EPUB import failed: missing META-INF/container.xml'
  );
});

it('keeps valid chapters and marks the run degraded when one chapter is missing', async () => {
  const filePath = await writeEpub('broken-chapter.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Broken Book</dc:title></metadata><manifest><item id="good" href="text/good.xhtml" media-type="application/xhtml+xml"/><item id="bad" href="text/missing.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="good"/><itemref idref="bad"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content: '<html><head><title>Good Chapter</title></head><body><p>Good body.</p></body></html>',
      name: 'OPS/text/good.xhtml'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-01T12:10:00.000Z');
  const children = readImportedChildren(imported.nodeId as string);

  expect(imported.resultStatus).toBe('degraded');
  expect(imported.degradedReason).toContain('EPUB chapter missing entry: OPS/text/missing.xhtml');
  expect(children).toHaveLength(2);
  expect(children[0]?.title).toBe('Good Chapter');
  expect(children[1]?.content).toContain('EPUB chapter missing entry: OPS/text/missing.xhtml');
});

it('imports embedded chapter images and rewrites relative epub image paths to stored attachments', async () => {
  const filePath = await writeEpub('embedded-images.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Image Book</dc:title></metadata><manifest><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/><item id="image" href="images/00006.jpeg" media-type="image/jpeg"/></manifest><spine><itemref idref="chapter"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content:
        '<html><head><title>Picture Chapter</title></head><body><p>Intro paragraph.</p><img src="../images/00006.jpeg" alt="Image"/><p>Outro paragraph.</p></body></html>',
      name: 'OPS/text/chapter.xhtml'
    },
    {
      content: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) as unknown as string,
      name: 'OPS/images/00006.jpeg'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-01T12:12:00.000Z');
  const database = openDatabaseConnection().sqlite;
  const child = database
    .prepare(
      `SELECT n.id, n.content
       FROM nodes n
       JOIN node_order o ON o.node_id = n.id
       WHERE n.parent_id = ?
       ORDER BY o.position ASC
       LIMIT 1`
    )
    .get(imported.nodeId) as { content: string; id: string };
  const attachments = listNodeAttachments(child.id);

  expect(imported.resultStatus).toBe('imported');
  expect(imported.degradedReason).toBeNull();
  expect(child.content).toContain('Intro paragraph.');
  expect(child.content).toContain('Outro paragraph.');
  expect(child.content).toContain('![Image](asset://');
  expect(child.content).not.toContain('../images/00006.jpeg');
  expect(child.content).not.toContain('[EPUB image not imported:');
  expect(attachments).toHaveLength(1);
  expect(attachments[0]?.attachment.mimeType).toBe('image/jpeg');
  expect(attachments[0]?.attachment.originalName).toBe('00006.jpeg');
});
