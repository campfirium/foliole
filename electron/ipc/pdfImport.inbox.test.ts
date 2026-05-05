// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-pdf-import-inbox-tests';

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
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadNodeSourceDetails } from '../database/nodeSourceDetails.js';

import { runManagedInboxImport } from './importDirectory.js';
import { loadPreparedImportRecord, resolveSingleFileImportSource } from './importSourcePipeline.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pdf-import-inbox-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function writePdf(fileName: string) {
  const filePath = path.join(tempRoot, fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'));
  return filePath;
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
      source_kind: 'epub' | 'html' | 'markdown' | 'pdf' | 'text';
      source_locator: string;
      source_name: string;
    };
}

function readPdfOpenDetails(nodeId: string) {
  const details = loadNodeSourceDetails(nodeId);
  return details?.importSource
    ? {
        source_kind: details.importSource.source_kind,
        source_locator: details.importSource.source_locator,
        source_name: details.importSource.source_name
      }
    : null;
}

async function resetDatabase(appDataDirName: string) {
  closeDatabaseConnection();
  mockedAppDataDir = path.join(tempRoot, appDataDirName);
  initializeDatabase();
}

it('imports pdf dropped into the managed inbox as a new inbox child', async () => {
  const managedRoot = path.join(tempRoot, 'managed-inbox');
  const filePath = await writePdf(path.join('managed-inbox', 'dropped.pdf'));

  const result = await runManagedInboxImport(managedRoot);
  const importedEntry = result.entries[0];

  expect(result).toEqual(expect.objectContaining({ consumed_count: 1, discovered_count: 1, failed_count: 0, imported_count: 1 }));
  expect(importedEntry).toEqual(
    expect.objectContaining({ result_status: 'imported', source_kind: 'pdf', source_name: 'dropped.pdf' })
  );
  expect(readImportedNode(importedEntry?.node_id as string)).toEqual({ parent_id: 'special-inbox', title: 'dropped' });
  expect(readPdfOpenDetails(importedEntry?.node_id as string)).toEqual({
    source_kind: 'pdf',
    source_locator: filePath,
    source_name: 'dropped.pdf'
  });
  await expect(fs.stat(filePath)).rejects.toThrow();
});

it('keeps manual pdf import and managed inbox import consistent for the same path', async () => {
  const managedRoot = path.join(tempRoot, 'shared-managed-inbox');
  const filePath = await writePdf(path.join('shared-managed-inbox', 'same-path.pdf'));

  const manualImport = runPreparedImport(
    await loadPreparedImportRecord(resolveSingleFileImportSource(filePath), {
      highlightPolicy: 'reference_only',
      importedAt: '2026-04-01T12:20:00.000Z',
      sourceTrackingMode: 'untracked',
      titleStrategy: 'file_name'
    })
  );
  const manualNode = readImportedNode(manualImport.nodeId as string);
  const manualRun = readImportRun(manualImport.importId);
  const manualOpenDetails = readPdfOpenDetails(manualImport.nodeId as string);

  await resetDatabase('app-data-inbox-parity');

  const inboxImport = await runManagedInboxImport(managedRoot);
  const inboxEntry = inboxImport.entries[0];
  const inboxNode = readImportedNode(inboxEntry?.node_id as string);
  const inboxRun = readImportRun(inboxEntry?.import_id as string);
  const inboxOpenDetails = readPdfOpenDetails(inboxEntry?.node_id as string);

  expect(manualNode).toEqual(inboxNode);
  expect(manualRun).toEqual(inboxRun);
  expect(manualOpenDetails).toEqual(inboxOpenDetails);
  expect(manualRun).toEqual({
    degraded_reason: null,
    result_status: 'imported',
    source_kind: 'pdf',
    source_locator: filePath,
    source_name: 'same-path.pdf'
  });
});
