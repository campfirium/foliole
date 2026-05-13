// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-epub-import-root-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-import-root-'));
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

function readImportedRoot(nodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT title, content FROM nodes WHERE id = ?')
    .get(nodeId) as { content: string; title: string };
}

function readImportedChildren(parentNodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT n.title
       FROM nodes n
       WHERE n.parent_id = ?
       ORDER BY n.title ASC`
    )
    .all(parentNodeId) as Array<{ title: string }>;
}

it('keeps the root node readable without auto-generated chapter title lists', async () => {
  const filePath = await writeEpub('root-cleanup.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Sample Book</dc:title></metadata><manifest><item id="chapter-1" href="text/chapter-1.xhtml" media-type="application/xhtml+xml"/><item id="chapter-2" href="text/chapter-2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/><itemref idref="chapter-2"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content: '<html><body><h1>Chapter 1</h1><p>First body.</p></body></html>',
      name: 'OPS/text/chapter-1.xhtml'
    },
    {
      content: '<html><body><h1>Chapter 2</h1><p>Second body.</p></body></html>',
      name: 'OPS/text/chapter-2.xhtml'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-02T10:00:00.000Z');
  const root = readImportedRoot(imported.nodeId as string);
  const children = readImportedChildren(imported.nodeId as string);

  expect(root).toEqual({
    content: '# Sample Book',
    title: 'Sample Book'
  });
  expect(root.content).not.toContain('- Chapter 1');
  expect(root.content).not.toContain('- Chapter 2');
  expect(children.map((child) => child.title)).toEqual(['Chapter 1', 'Chapter 2']);
});

it('imports a guide-marked cover page into the root node body', async () => {
  const filePath = await writeEpub('cover-page.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Cover Book</dc:title></metadata><manifest><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="cover"/><itemref idref="chapter"/></spine><guide><reference type="cover" title="Cover" href="cover.xhtml"/></guide></package>',
      name: 'OPS/book.opf'
    },
    {
      content: '<html><head><title>Cover</title></head><body><img src="images/cover.png" alt="Cover"/></body></html>',
      name: 'OPS/cover.xhtml'
    },
    {
      content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      name: 'OPS/images/cover.png'
    },
    {
      content: '<html><body><h1>Real Chapter</h1><p>Hello world.</p></body></html>',
      name: 'OPS/text/chapter.xhtml'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-02T10:05:00.000Z');
  const root = readImportedRoot(imported.nodeId as string);
  const attachments = listNodeAttachments(imported.nodeId as string);
  const children = readImportedChildren(imported.nodeId as string);

  expect(root.title).toBe('Cover Book');
  expect(root.content).toContain('![Cover](asset://');
  expect(root.content).not.toContain('images/cover.png');
  expect(root.content).not.toContain('- Real Chapter');
  expect(attachments).toHaveLength(1);
  expect(children.map((child) => child.title)).toEqual(['Real Chapter']);
});

it('imports a manifest-declared cover image into the root node when no cover page exists', async () => {
  const filePath = await writeEpub('cover-image.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Image Cover Book</dc:title></metadata><manifest><item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      name: 'OPS/images/cover.png'
    },
    {
      content: '<html><body><h1>Real Chapter</h1><p>Hello again.</p></body></html>',
      name: 'OPS/text/chapter.xhtml'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-02T10:10:00.000Z');
  const root = readImportedRoot(imported.nodeId as string);
  const attachments = listNodeAttachments(imported.nodeId as string);

  expect(root.title).toBe('Image Cover Book');
  expect(root.content).toContain('![Cover](asset://');
  expect(root.content).not.toContain('OPS/images/cover.png');
  expect(attachments).toHaveLength(1);
});
