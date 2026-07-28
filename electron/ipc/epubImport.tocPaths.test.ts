// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-epub-import-toc-paths-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { runEpubImport } from './epubImport.js';
import { createTestZip } from './testZipBuilder.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-import-toc-paths-'));
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

function readChildren(parentNodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT id, title, content FROM nodes WHERE parent_id = ? ORDER BY title ASC')
    .all(parentNodeId) as Array<{ content: string; id: string; title: string }>;
}

it('matches NCX TOC hrefs with percent-encoded spaces to spine chapter paths', async () => {
  const filePath = await writeEpub('encoded-toc-paths.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Encoded Paths</dc:title></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="intro" href="Introduction.html" media-type="application/xhtml+xml"/><item id="chapter" href="Gao Zhong Sheng Shi Jiao.html" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="intro"/><itemref idref="chapter"/></spine></package>',
      name: 'book.opf'
    },
    {
      content:
        '<ncx><navMap><navPoint><navLabel><text>Part One</text></navLabel><content src="Introduction.html"/><navPoint><navLabel><text>高中生视角</text></navLabel><content src="Gao%20Zhong%20Sheng%20Shi%20Jiao.html"/></navPoint></navPoint></navMap></ncx>',
      name: 'toc.ncx'
    },
    {
      content: '<html><head><title>Part One</title></head><body><h1>Part One</h1><p>Intro body.</p></body></html>',
      name: 'Introduction.html'
    },
    {
      content: '<html><head><title>高中生视角 · 看云</title></head><body><h1>高中生视角</h1><p>Real body.</p></body></html>',
      name: 'Gao Zhong Sheng Shi Jiao.html'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-07-28T12:00:00.000Z');
  const rootChildren = readChildren(imported.nodeId as string);
  const part = rootChildren.find((child) => child.title === 'Part One');
  const nestedChildren = readChildren(part?.id ?? '');
  const nestedByTitle = new Map(nestedChildren.map((child) => [child.title, child]));

  expect(rootChildren.map((child) => child.title)).toEqual(['Part One']);
  expect(nestedChildren.map((child) => child.title)).toEqual(['Part One', '高中生视角']);
  expect(nestedChildren.every((child) => child.content.trim().length > 0)).toBe(true);
  expect(nestedByTitle.get('高中生视角')?.content).toContain('Real body.');
});
