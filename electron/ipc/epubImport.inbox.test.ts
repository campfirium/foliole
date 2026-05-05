// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-epub-import-inbox-tests';

vi.mock('electron', () => ({
  shell: {
    trashItem: vi.fn(async (filePath: string) => {
      await fs.rm(filePath, { force: true, recursive: true });
    })
  }
}));

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
import { runManagedInboxImport } from './importDirectory.js';
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

function createInboxBookEntries() {
  return [
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
  ];
}

async function writeEpub(fileName: string, entries: Array<{ content: string | Uint8Array; name: string }>) {
  const filePath = path.join(tempRoot, fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
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

function readImportedNode(nodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT parent_id, title FROM nodes WHERE id = ?')
    .get(nodeId) as { parent_id: string | null; title: string } | undefined;
}

function readImportRun(importId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT source_kind, source_locator, source_name, result_status, degraded_reason FROM import_runs WHERE id = ?')
    .get(importId) as {
      degraded_reason: string | null;
      result_status: 'degraded' | 'failed' | 'imported';
      source_kind: 'epub' | 'html' | 'markdown' | 'text';
      source_locator: string;
      source_name: string;
    };
}

function readBookSummary(nodeId: string) {
  return {
    children: readImportedChildren(nodeId).map((child) => child.title),
    node: readImportedNode(nodeId)
  };
}

async function resetDatabase(appDataDirName: string) {
  closeDatabaseConnection();
  mockedAppDataDir = path.join(tempRoot, appDataDirName);
  initializeDatabase();
}

it('creates a fresh inbox copy when the same manual epub is imported again after the earlier copy was moved', async () => {
  const filePath = await writeEpub('manual-inbox.epub', createInboxBookEntries());

  const firstImport = await runEpubImport(source(filePath), '2026-04-01T12:15:00.000Z');
  openDatabaseConnection().driver.execute('UPDATE nodes SET parent_id = NULL WHERE id = ?', [firstImport.nodeId]);

  const secondImport = await runEpubImport(source(filePath), '2026-04-01T12:16:00.000Z');
  const importedRoots = openDatabaseConnection().sqlite
    .prepare("SELECT id, parent_id, title FROM nodes WHERE title = 'Inbox Book' ORDER BY created_at ASC")
    .all() as Array<{ id: string; parent_id: string | null; title: string }>;

  expect(firstImport.nodeId).not.toBe(secondImport.nodeId);
  expect(importedRoots).toHaveLength(1);
  expect(importedRoots[0]).toMatchObject({ parent_id: null, title: 'Inbox Book' });
  expect(readImportedChildren(secondImport.nodeId as string).map((child) => child.title)).toContain('Part One');
});

it('imports epub dropped into the managed inbox as a new inbox child', async () => {
  const managedRoot = path.join(tempRoot, 'managed-inbox');
  const filePath = await writeEpub(path.join('managed-inbox', 'dropped.epub'), createInboxBookEntries());

  const result = await runManagedInboxImport(managedRoot);
  const importedEntry = result.entries[0];

  expect(result).toEqual(expect.objectContaining({ consumed_count: 1, discovered_count: 1, failed_count: 0, imported_count: 1 }));
  expect(importedEntry).toEqual(
    expect.objectContaining({ result_status: 'imported', source_kind: 'epub', source_name: 'dropped.epub' })
  );
  expect(readImportedNode(importedEntry?.node_id as string)).toEqual({ parent_id: 'special-inbox', title: 'Inbox Book' });
  expect(readImportedChildren(importedEntry?.node_id as string).map((child) => child.title)).toContain('Part One');
  await expect(fs.stat(filePath)).rejects.toThrow();
});

it('keeps manual epub import and managed inbox import consistent for the same path', async () => {
  const managedRoot = path.join(tempRoot, 'shared-managed-inbox');
  const filePath = await writeEpub(path.join('shared-managed-inbox', 'same-path.epub'), createInboxBookEntries());

  const manualImport = await runEpubImport(source(filePath), '2026-04-01T12:20:00.000Z');
  const manualSummary = readBookSummary(manualImport.nodeId as string);
  const manualRun = readImportRun(manualImport.importId);

  await resetDatabase('app-data-inbox-parity');

  const inboxImport = await runManagedInboxImport(managedRoot);
  const inboxEntry = inboxImport.entries[0];
  const inboxSummary = readBookSummary(inboxEntry?.node_id as string);
  const inboxRun = readImportRun(inboxEntry?.import_id as string);

  expect(manualSummary).toEqual(inboxSummary);
  expect(manualRun).toEqual(inboxRun);
  expect(manualRun).toEqual({
    degraded_reason: null,
    result_status: 'imported',
    source_kind: 'epub',
    source_locator: filePath,
    source_name: 'same-path.epub'
  });
});

it('records managed inbox epub failures instead of silently skipping them', async () => {
  const managedRoot = path.join(tempRoot, 'broken-managed-inbox');
  const filePath = path.join(managedRoot, 'broken.epub');
  await fs.mkdir(managedRoot, { recursive: true });
  await fs.writeFile(filePath, 'not a valid epub archive', 'utf8');

  const result = await runManagedInboxImport(managedRoot);
  const failedEntry = result.entries[0];
  const recordedRun = readImportRun(failedEntry?.import_id as string);

  expect(result).toEqual(expect.objectContaining({ consumed_count: 0, discovered_count: 1, failed_count: 1, imported_count: 0 }));
  expect(failedEntry).toEqual(
    expect.objectContaining({
      failure_reason: expect.stringMatching(/^EPUB import failed:/),
      node_id: null,
      result_status: 'failed',
      source_kind: 'epub',
      source_name: 'broken.epub'
    })
  );
  expect(recordedRun).toEqual({
    degraded_reason: null,
    result_status: 'failed',
    source_kind: 'epub',
    source_locator: filePath,
    source_name: 'broken.epub'
  });
  await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('not a valid epub archive');
});
