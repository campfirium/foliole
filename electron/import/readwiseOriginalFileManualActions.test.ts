// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-original-file-action-tests';

const { openExternal, showOpenDialog } = vi.hoisted(() => ({
  openExternal: vi.fn().mockResolvedValue(undefined),
  showOpenDialog: vi.fn()
}));

vi.mock('electron', () => ({
  dialog: { showOpenDialog },
  shell: { openExternal }
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: vi.fn(() => true)
}));

vi.mock('../database/pdfIndexing.js', async () => ({
  ...await vi.importActual<typeof import('../database/pdfIndexing.js')>('../database/pdfIndexing.js'),
  enqueuePdfAttachmentIndexing: vi.fn()
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { listNodeAttachments } from '../database/attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { recordDesktopImportLocation } from '../database/desktopSources.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { loadReadwiseBookEpub, openReadwiseBookDownload } from './readwiseBookManualActions.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-original-actions-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  openExternal.mockReset();
  showOpenDialog.mockReset();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}, 30_000);

async function seedReadwisePdfTopic() {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const fullDocumentDir = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  const highlightDir = path.join(readwiseRoot, 'Articles');
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  const sourcePath = path.join(fullDocumentDir, 'PDF Topic.md');
  await fs.writeFile(
    sourcePath,
    [
      '# PDF Topic',
      '',
      'Full text of this document omitted because this document is a PDF',
      '',
      '[Download original file →](https://readwise.io/reader/document_raw_content/1)'
    ].join('\n'),
    'utf8'
  );
  saveImportManagerSettings({
    readwiseReaderConfig: { enabled: true, highlightsHeading: '## Highlights', importScope: 'full_document', validatedAt: null },
    readwiseRootPath: readwiseRoot,
    readwiseSources: [{
      highlightMode: 'split',
      highlightPath: highlightDir,
      id: 'draft-import-source-1',
      keepPreview: null,
      keepState: 'enabled',
      kind: 'articles',
      primaryPath: fullDocumentDir
    }]
  });
  const prepared = createPreparedDesktopTextImport({
    content: '# PDF Topic\n\nFull text of this document omitted because this document is a PDF\n\n[Download original file →](https://readwise.io/reader/document_raw_content/1)',
    fileName: 'PDF Topic.md',
    filePath: sourcePath,
    importedAt: '2026-05-19T00:00:00.000Z',
    kind: 'markdown',
    sourceIdentity: 'readwise/articles/PDF Topic.md',
    sourceLocator: sourcePath
  });
  const imported = runPreparedImport(prepared);
  recordDesktopImportLocation({
    configRef: 'draft-import-source-1',
    location: 'PDF Topic.md',
    sourceFingerprint: prepared.sourceFingerprint,
    sourceType: 'readwise',
    updatedAt: '2026-05-19T00:00:00.000Z'
  });
  return imported.nodeId as string;
}

it('uses the shared original-file actions for a Readwise PDF topic', async () => {
  const nodeId = await seedReadwisePdfTopic();
  const pdfPath = path.join(tempRoot, 'PDF Topic.pdf');
  await fs.writeFile(pdfPath, '%PDF-1.4\n');
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [pdfPath] });

  await expect(openReadwiseBookDownload(nodeId)).resolves.toMatchObject({ status: 'opened', url: 'https://readwise.io/reader/document_raw_content/1' });
  expect(openExternal).toHaveBeenCalledWith('https://readwise.io/reader/document_raw_content/1');

  await expect(loadReadwiseBookEpub(nodeId)).resolves.toMatchObject({ epub_path: pdfPath, status: 'selected', title: 'PDF Topic' });
  expect(listNodeAttachments(nodeId)[0]?.attachment.mimeType).toBe('application/pdf');
  expect(openDatabaseConnection().driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id = ?', [nodeId])?.title).toBe('PDF Topic');
});
