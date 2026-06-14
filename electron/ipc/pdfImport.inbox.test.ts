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

vi.mock('../database/pdfIndexingTaskQueue.js', () => ({
  submitPdfIndexingTask: (attachmentId: string) => ({
    cancel: () => undefined,
    id: `pdf-indexing:${attachmentId}`,
    promise: Promise.resolve()
  })
}));

import { buildAttachmentAssetUrl } from '../attachments/attachmentAssetUrl.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';
import { listNodeAttachments } from '../database/attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';

import { runManagedInboxImport } from './importDirectory.js';
import { loadPreparedImportRecord, resolveSingleFileImportSource } from './importSourcePipeline.js';
import { toNativeNodeSourceDetails } from './nodeSourceDetailsPayload.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pdf-import-inbox-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

async function writePdf(fileName: string) {
  const filePath = path.join(tempRoot, fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(`%PDF-1.4\n% ${fileName}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n`));
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
  const details = toNativeNodeSourceDetails(nodeId);
  return details?.import_source
    ? {
        source_kind: details.import_source.source_kind,
        source_locator: details.import_source.source_locator,
        source_name: details.import_source.source_name
      }
    : null;
}

function resolvePdfAttachmentAssetUrl(attachmentId: string) {
  const resolved = resolveAttachmentFile(attachmentId);
  expect(resolved.status).toBe('ready');
  return buildAttachmentAssetUrl(attachmentId);
}

async function expectPdfImportChain(options: {
  expectedTitle: string;
  importId: string;
  nodeId: string;
  sourceLocator: string;
  sourceName: string;
}) {
  expect(readImportedNode(options.nodeId)).toEqual({ parent_id: 'special-inbox', title: options.expectedTitle });
  expect(readImportRun(options.importId)).toEqual({
    degraded_reason: null,
    result_status: 'imported',
    source_kind: 'pdf',
    source_locator: options.sourceLocator,
    source_name: options.sourceName
  });

  const pdfAttachment = listNodeAttachments(options.nodeId)[0];
  expect(pdfAttachment).toEqual(
    expect.objectContaining({
      role: 'reference',
      attachment: expect.objectContaining({ mimeType: 'application/pdf', originalName: options.sourceName })
    })
  );
  expect(readPdfOpenDetails(options.nodeId)).toEqual({
    source_kind: 'pdf',
    source_locator: resolvePdfAttachmentAssetUrl(pdfAttachment?.attachmentId as string),
    source_name: options.sourceName
  });
  expect(openDatabaseConnection().sqlite
    .prepare("SELECT COUNT(*) AS count FROM attachment_blobs WHERE attachment_id = ?")
    .get(pdfAttachment?.attachmentId)).toEqual({ count: 1 });
  expect(openDatabaseConnection().sqlite
    .prepare("SELECT COUNT(*) AS count FROM sync_object_state WHERE object_type = 'attachment' AND object_id = ?")
    .get(pdfAttachment?.attachmentId)).toEqual({ count: 1 });
}

it('imports pdf dropped into the managed inbox and keeps node/import/opening chain valid', async () => {
  const managedRoot = path.join(tempRoot, 'managed-inbox');
  const filePath = await writePdf(path.join('managed-inbox', 'dropped.pdf'));

  const result = await runManagedInboxImport(managedRoot);
  const importedEntry = result.entries[0];

  expect(result).toEqual(expect.objectContaining({ consumed_count: 1, discovered_count: 1, failed_count: 0, imported_count: 1 }));
  expect(importedEntry).toEqual(
    expect.objectContaining({ result_status: 'imported', source_kind: 'pdf', source_name: 'dropped.pdf' })
  );
  await expectPdfImportChain({
    expectedTitle: 'dropped',
    importId: importedEntry?.import_id as string,
    nodeId: importedEntry?.node_id as string,
    sourceLocator: filePath,
    sourceName: 'dropped.pdf'
  });
  await expect(fs.stat(filePath)).rejects.toThrow();
});

it('reopens the same pdf from attachments after the original file is removed and the app restarts', async () => {
  const filePath = await writePdf(path.join('manual-import', 'restart-proof.pdf'));

  const imported = runPreparedImport(
    await loadPreparedImportRecord(resolveSingleFileImportSource(filePath), {
      highlightPolicy: 'reference_only',
      importedAt: '2026-04-01T12:24:00.000Z',
      sourceTrackingMode: 'untracked',
      titleStrategy: 'file_name'
    })
  );

  const pdfAttachment = listNodeAttachments(imported.nodeId as string)[0];
  const linkedBeforeRestart = readPdfOpenDetails(imported.nodeId as string);
  expect(linkedBeforeRestart).toEqual({
    source_kind: 'pdf',
    source_locator: resolvePdfAttachmentAssetUrl(pdfAttachment?.attachmentId as string),
    source_name: 'restart-proof.pdf'
  });

  await fs.rm(filePath, { force: true });
  closeDatabaseConnection();
  initializeDatabase();

  const linkedAfterRestart = readPdfOpenDetails(imported.nodeId as string);
  expect(linkedAfterRestart).toEqual(linkedBeforeRestart);
});

it('imports pdf through manual import and keeps node/import/opening chain valid', async () => {
  const filePath = await writePdf(path.join('manual-import', 'same-path.pdf'));

  const manualImport = runPreparedImport(
    await loadPreparedImportRecord(resolveSingleFileImportSource(filePath), {
      highlightPolicy: 'reference_only',
      importedAt: '2026-04-01T12:20:00.000Z',
      sourceTrackingMode: 'untracked',
      titleStrategy: 'file_name'
    })
  );
  await expectPdfImportChain({
    expectedTitle: 'same-path',
    importId: manualImport.importId,
    nodeId: manualImport.nodeId as string,
    sourceLocator: filePath,
    sourceName: 'same-path.pdf'
  });
});
