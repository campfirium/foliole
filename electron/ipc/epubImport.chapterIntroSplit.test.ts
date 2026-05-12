// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-epub-import-chapter-intro-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-import-chapter-intro-'));
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

function readChildren(parentNodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT n.id, n.title, n.content
       FROM nodes n
       WHERE n.parent_id = ?
       ORDER BY n.title ASC`
    )
    .all(parentNodeId) as Array<{ content: string; id: string; title: string }>;
}

it('splits chapter intro content into the first child section when toc chapter also has nested sections', async () => {
  const filePath = await writeEpub('chapter-intro-split.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Sample Book</dc:title></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="chapter-3" href="text/chapter-3.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="chapter-3"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content: `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="ch3" playOrder="1">
      <navLabel><text>第三章 越少越好</text></navLabel>
      <content src="text/chapter-3.xhtml"/>
      <navPoint id="ch3-s1" playOrder="2">
        <navLabel><text>从流程开始</text></navLabel>
        <content src="text/chapter-3.xhtml#s1"/>
      </navPoint>
      <navPoint id="ch3-s2" playOrder="3">
        <navLabel><text>最后创建</text></navLabel>
        <content src="text/chapter-3.xhtml#s2"/>
      </navPoint>
    </navPoint>
  </navMap>
</ncx>`,
      name: 'OPS/toc.ncx'
    },
    {
      content:
        '<html><body><h1>第三章 越少越好</h1><p>告诉你一个秘密。</p><h2 id="s1">从流程开始</h2><p>Alpha</p><h2 id="s2">最后创建</h2><p>Beta</p></body></html>',
      name: 'OPS/text/chapter-3.xhtml'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-04T12:00:00.000Z');
  const chapterRows = readChildren(imported.nodeId as string);
  expect(chapterRows.map((node) => node.title)).toEqual(['第三章 越少越好']);
  expect(chapterRows[0]?.content).toBe('**第三章 越少越好**');

  const sectionRows = readChildren(chapterRows[0]!.id);
  expect(sectionRows.map((node) => node.title).sort()).toEqual(['从流程开始', '最后创建', '越少越好']);
  expect(sectionRows.find((node) => node.title === '越少越好')?.content).toContain('告诉你一个秘密。');
  expect(sectionRows.find((node) => node.title === '从流程开始')?.content).toBe('');
  expect(sectionRows.find((node) => node.title === '最后创建')?.content).toBe('');
});
