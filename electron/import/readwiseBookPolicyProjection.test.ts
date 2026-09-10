// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createDefaultReadwiseAutoImportPolicy, type ReadwiseAutoImportPolicy } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { runImportForFilePath } from '../ipc/importTextFile.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { loadPersistedReadwiseBooksInventory } from './readwiseBooksInventoryState.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-book-policy-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

async function seedBook(highlightBody = 'book quote') {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const primaryPath = path.join(readwiseRoot, 'Full Document Contents', 'Books');
  const highlightPath = path.join(readwiseRoot, 'Books');
  await fs.mkdir(primaryPath, { recursive: true });
  await fs.mkdir(highlightPath, { recursive: true });
  const filePath = path.join(primaryPath, 'Book.md');
  await fs.writeFile(filePath, '# Book\n\n## Full Document\nBody.\n', 'utf8');
  await fs.writeFile(
    path.join(highlightPath, 'Book.md'),
    `# Book\n\n## Highlights\n${highlightBody}\n`,
    'utf8'
  );
  return { filePath, highlightPath, primaryPath, readwiseRoot };
}

function saveSettings(
  paths: Awaited<ReturnType<typeof seedBook>>,
  policy: ReadwiseAutoImportPolicy
) {
  saveImportManagerSettings({
    readwiseAutoImportPolicy: policy,
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-09-10T00:00:00.000Z'
    },
    readwiseRootPath: paths.readwiseRoot,
    readwiseSources: [{
      highlightMode: 'split', highlightPath: paths.highlightPath,
      id: 'draft-import-source-books', keepPreview: null, keepState: 'enabled',
      kind: 'books', primaryPath: paths.primaryPath
    }]
  });
}

function activeBookNodes() {
  return openDatabaseConnection().driver.queryAll<{ id: string }>(
    "SELECT id FROM nodes WHERE title = 'Book' AND deleted_at IS NULL"
  );
}

it('routes highlighted Books through External and adopts the selected document once', async () => {
  const paths = await seedBook();
  const policy = {
    ...createDefaultReadwiseAutoImportPolicy(),
    bookWithHighlights: 'external' as const
  };
  saveSettings(paths, policy);
  await runReadwiseReaderImport();
  const documentId = 'readwise-reader-import-books:Book.md';
  expect(openDatabaseConnection().driver.queryOne<{ is_present: number }>(
    'SELECT is_present FROM external_documents WHERE document_id = ?', [documentId]
  )).toEqual({ is_present: 1 });

  const imported = await runImportForFilePath(paths.filePath);
  await runReadwiseReaderImport();
  saveSettings(paths, { ...policy, bookWithHighlights: 'off' });
  await runReadwiseReaderImport();

  expect(activeBookNodes()).toHaveLength(1);
  expect(openDatabaseConnection().driver.queryOne<{ is_present: number }>(
    'SELECT is_present FROM external_documents WHERE document_id = ?', [documentId]
  )).toEqual({ is_present: 0 });
  expect(openDatabaseConnection().driver.queryOne<{ deleted_at: string | null; sync_dirty: number }>(
    "SELECT deleted_at, sync_dirty FROM sync_object_state WHERE object_type = 'external_document' AND object_id = ?",
    [documentId]
  )).toMatchObject({ deleted_at: expect.any(String), sync_dirty: 1 });
  expect(loadPersistedReadwiseBooksInventory({
    fullDocumentDirectoryPath: paths.primaryPath,
    highlightDirectoryPath: paths.highlightPath
  })?.books[0]).toMatchObject({
    bodyState: 'loaded', generatedNodeId: imported.node_id,
    importStatus: 'completed', nodeStatus: 'generated'
  });
});

it('routes a Book without normalized highlights to Off without creating a Topic', async () => {
  const paths = await seedBook('');
  saveSettings(paths, {
    ...createDefaultReadwiseAutoImportPolicy(),
    bookWithoutHighlights: 'off'
  });

  await expect(runReadwiseReaderImport()).resolves.toMatchObject({ status: 'completed' });
  expect(activeBookNodes()).toEqual([]);
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM external_documents WHERE folder_id = 'readwise-reader-import-books' AND is_present = 1"
  )).toEqual({ count: 0 });
});
