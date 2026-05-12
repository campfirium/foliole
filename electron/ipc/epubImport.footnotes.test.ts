// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-epub-import-footnotes-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-import-footnotes-'));
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

function readImportedChildren(parentNodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT n.title, n.content
       FROM nodes n
       WHERE n.parent_id = ?
       ORDER BY n.title ASC`
    )
    .all(parentNodeId) as Array<{ content: string; title: string }>;
}

it('maps paired epub footnotes into hover-ready markers without misclassifying ordinary links', async () => {
  const filePath = await writeEpub('footnotes.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Footnote Book</dc:title></metadata><manifest><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content:
        '<html><head><title>Chapter Footnotes</title></head><body><p>Weight<sup><a href="chapter.xhtml#ref9" id="annot9">1</a></sup> matters.</p><p>Chapter jump <a href="chapter.xhtml#c1">1</a> stays a real link.</p><p><a href="chapter.xhtml#annot9" id="ref9">1</a>1 pound is about 0.454 kilograms. — Editor note</p></body></html>',
      name: 'OPS/text/chapter.xhtml'
    }
  ]);

  const imported = await runEpubImport(source(filePath), '2026-04-03T09:10:00.000Z');
  const children = readImportedChildren(imported.nodeId as string);

  expect(imported.resultStatus).toBe('imported');
  expect(children).toHaveLength(1);
  expect(children[0]?.content).toContain('Weight^[1]{1 pound is about 0.454 kilograms. — Editor note} matters.');
  expect(children[0]?.content).toContain('Chapter jump [1](chapter.xhtml#c1) stays a real link.');
  expect(children[0]?.content).not.toContain('Chapter jump ^[1]');
});
