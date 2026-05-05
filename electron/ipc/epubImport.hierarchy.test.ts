// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-epub-import-hierarchy-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-import-hierarchy-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function writeEpub(fileName: string, entries: Array<{ content: string; name: string }>) {
  const filePath = path.join(tempRoot, fileName);
  await fs.writeFile(filePath, createTestZip(entries.map((entry) => ({ ...entry, compression: 'store' as const }))));
  return filePath;
}

function source(filePath: string) {
  return { adapterId: 'text_file' as const, filePath, kind: 'epub' as const, sourceName: path.basename(filePath) };
}

function readImportedTree(parentNodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT n.id, n.parent_id, n.title, n.content
       FROM nodes n
       JOIN node_order o ON o.node_id = n.id
       WHERE n.id = ? OR n.parent_id = ? OR n.parent_id IN (
         SELECT id FROM nodes WHERE parent_id = ?
       ) OR n.parent_id IN (
         SELECT id FROM nodes WHERE parent_id IN (
           SELECT id FROM nodes WHERE parent_id = ?
         )
       )
       ORDER BY o.position ASC`
    )
    .all(parentNodeId, parentNodeId, parentNodeId, parentNodeId) as Array<{
      content: string;
      id: string;
      parent_id: string | null;
      title: string;
    }>;
}

it('keeps a self-linked toc page with readable body while preserving nested epub navigation hierarchy', async () => {
  const filePath = await writeEpub('nested-nav.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Sample Book</dc:title></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="part" href="text/part.xhtml" media-type="application/xhtml+xml"/><item id="chapter-1" href="text/chapter-1.xhtml" media-type="application/xhtml+xml"/><item id="chapter-2" href="text/chapter-2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="nav"/><itemref idref="part"/><itemref idref="chapter-1"/><itemref idref="chapter-2"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content:
        '<html><head><title>目录</title></head><body><h1>目录</h1><nav epub:type="toc"><ol><li><a href="nav.xhtml">目录</a><ol><li><a href="text/part.xhtml">Part One</a><ol><li><a href="text/chapter-1.xhtml">Chapter 1</a></li><li><a href="text/chapter-2.xhtml">Chapter 2</a></li></ol></li></ol></li></ol></nav></body></html>',
      name: 'OPS/nav.xhtml'
    },
    {
      content: '<html><body><h1>Part Body</h1><p>Part intro.</p></body></html>',
      name: 'OPS/text/part.xhtml'
    },
    {
      content: '<html><body><h1>Body Chapter 1</h1><p>Chapter one body.</p></body></html>',
      name: 'OPS/text/chapter-1.xhtml'
    },
    {
      content: '<html><body><h1>Body Chapter 2</h1><p>Chapter two body.</p></body></html>',
      name: 'OPS/text/chapter-2.xhtml'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-01T12:02:00.000Z');
  const nodes = readImportedTree(imported.nodeId as string);
  const tocNode = nodes.find((node) => node.title === '目录');
  const partNode = nodes.find((node) => node.title === 'Part One');
  const chapterOneNode = nodes.find((node) => node.title === 'Chapter 1');
  const chapterTwoNode = nodes.find((node) => node.title === 'Chapter 2');

  expect(tocNode?.parent_id).toBe(imported.nodeId);
  expect(tocNode?.content).toContain('# 目录');
  expect(tocNode?.content).toContain('[Part One](text/part.xhtml)');
  expect(partNode?.parent_id).toBe(tocNode?.id);
  expect(chapterOneNode?.parent_id).toBe(partNode?.id);
  expect(chapterTwoNode?.parent_id).toBe(partNode?.id);
});
