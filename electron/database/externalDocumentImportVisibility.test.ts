// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-external-import-visibility-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('../import/managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated: vi.fn()
}));

import { saveImportManagerSettings } from '../import/importManagerSettings.js';
import { runKeepImportRule } from '../import/keepImportService.js';
import { runImportForFilePath } from '../ipc/importTextFile.js';

import { closeDatabaseConnection } from './connection.js';
import {
  refreshExternalSearchIndexes,
  searchExternalDocuments
} from './externalSearchCache.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { loadExternalSearchBrowseEntries } from './externalSearchCacheRead.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';
import { softDeleteNodes } from './nodeMutations.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-import-visibility-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function importAndSoftDelete(filePath: string) {
  const result = await runImportForFilePath(filePath);
  expect(result.node_id).toEqual(expect.any(String));
  expect(loadExternalSearchBrowseEntries('folder-1').map((entry) => entry.absolute_path)).not.toContain(filePath);
  expect(searchExternalDocuments('visible body').map((entry) => entry.id)).not.toContain(filePath);
  softDeleteNodes({ deletedAt: '2026-05-12T00:00:00.000Z', nodeIds: [result.node_id!] });
}

it('hides a regular external document while its imported Topic is active', async () => {
  const libraryRoot = path.join(tempRoot, 'library');
  const filePath = path.join(libraryRoot, 'alpha.md');
  await fs.mkdir(libraryRoot, { recursive: true });
  await fs.writeFile(filePath, '# Alpha\n\nvisible body\n', 'utf8');
  saveExternalSearchFolders([
    {
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      excluded_dirs: [],
      folder_path: libraryRoot,
      id: 'folder-1'
    }
  ]);
  await refreshExternalSearchIndexes();

  await importAndSoftDelete(filePath);

  expect(loadExternalSearchBrowseEntries('folder-1').map((entry) => entry.absolute_path)).toContain(filePath);
  expect(searchExternalDocuments('visible body').map((entry) => entry.id)).toContain(filePath);
});

it('hides a Readwise external document while its imported Topic is active', async () => {
  const fullDocumentDir = path.join(tempRoot, 'readwise', 'Full Document Contents', 'Articles');
  const highlightDir = path.join(tempRoot, 'readwise', 'Articles');
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  const filePath = path.join(fullDocumentDir, 'Plain.md');
  await fs.writeFile(filePath, '# Plain\n\nvisible body\n', 'utf8');
  saveImportManagerSettings({
    readwiseReaderConfig: {
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'external'
    },
    readwiseRootPath: path.join(tempRoot, 'readwise'),
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: highlightDir,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: fullDocumentDir
      }
    ]
  });
  await runKeepImportRule({
    directoryPath: fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  await importAndSoftDelete(filePath);

  expect(loadExternalSearchBrowseEntries('readwise-reader-import-articles').map((entry) => entry.absolute_path)).toContain(filePath);
  expect(searchExternalDocuments('visible body').map((entry) => entry.id)).toContain(filePath);
});
