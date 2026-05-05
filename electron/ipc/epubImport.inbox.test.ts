// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-epub-import-inbox-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-import-inbox-'));
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
      `SELECT n.title
       FROM nodes n
       JOIN node_order o ON o.node_id = n.id
       WHERE n.parent_id = ?
       ORDER BY o.position ASC`
    )
    .all(parentNodeId) as Array<{ title: string }>;
}

it('treats manual epub imports as new inbox items instead of updating an earlier moved copy', async () => {
  const filePath = await writeEpub('manual-inbox.epub', [
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content:
        '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content:
        '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Inbox Book</dc:title></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="part" href="text/part.xhtml" media-type="application/xhtml+xml"/><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="nav"/><itemref idref="part"/><itemref idref="chapter"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content:
        '<html><body><nav epub:type="toc"><ol><li><a href="text/part.xhtml">Part One</a><ol><li><a href="text/chapter.xhtml">Chapter 1</a></li></ol></li></ol></nav></body></html>',
      name: 'OPS/nav.xhtml'
    },
    {
      content: '<html><body><h1>Part Body</h1><p>Part intro.</p></body></html>',
      name: 'OPS/text/part.xhtml'
    },
    {
      content: '<html><body><h1>Body Chapter 1</h1><p>Chapter one body.</p></body></html>',
      name: 'OPS/text/chapter.xhtml'
    }
  ]);

  const firstImport = await runEpubImport(source(filePath), '2026-04-01T12:15:00.000Z');
  openDatabaseConnection().driver.execute('UPDATE nodes SET parent_id = NULL WHERE id = ?', [firstImport.nodeId]);

  const secondImport = await runEpubImport(source(filePath), '2026-04-01T12:16:00.000Z');
  const database = openDatabaseConnection().sqlite;
  const importedRoots = database
    .prepare("SELECT id, parent_id, title FROM nodes WHERE title = 'Inbox Book' ORDER BY created_at ASC")
    .all() as Array<{ id: string; parent_id: string | null; title: string }>;

  expect(firstImport.nodeId).not.toBe(secondImport.nodeId);
  expect(importedRoots).toEqual([
    { id: firstImport.nodeId as string, parent_id: null, title: 'Inbox Book' },
    { id: secondImport.nodeId as string, parent_id: 'special-inbox', title: 'Inbox Book' }
  ]);
  expect(readImportedChildren(secondImport.nodeId as string).map((child) => child.title)).toEqual(['Part One']);
});
