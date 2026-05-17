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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import {
  refreshExternalSearchIndexes,
  searchExternalDocuments
} from './externalSearchCache.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { loadExternalSearchBrowseEntries } from './externalSearchCacheRead.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently, softDeleteNodes } from './nodeMutations.js';

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

function readNodeOrder() {
  return (openDatabaseConnection().sqlite.prepare('SELECT node_id FROM node_order ORDER BY position ASC').all() as Array<{ node_id: string }>).map(
    (row) => row.node_id
  );
}

async function importDocument(filePath: string) {
  const result = await runImportForFilePath(filePath);
  expect(result.node_id).toEqual(expect.any(String));
  return result.node_id!;
}

async function importAndSoftDelete(filePath: string) {
  const nodeId = await importDocument(filePath);
  expect(loadExternalSearchBrowseEntries('folder-1').find((entry) => entry.absolute_path === filePath)).toMatchObject({
    absolute_path: filePath,
    imported_node_id: nodeId
  });
  expect(searchExternalDocuments('visible body').map((entry) => entry.id)).not.toContain(filePath);
  softDeleteNodes({ deletedAt: '2026-05-12T00:00:00.000Z', nodeIds: [nodeId] });
  return nodeId;
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

  const nodeId = await importAndSoftDelete(filePath);

  expect(loadExternalSearchBrowseEntries('folder-1').find((entry) => entry.absolute_path === filePath)).toMatchObject({
    absolute_path: filePath,
    imported_node_id: nodeId
  });
  expect(searchExternalDocuments('visible body').map((entry) => entry.id)).not.toContain(filePath);

  deleteNodesPermanently({ nodeIds: [nodeId], nodeOrder: readNodeOrder() });

  expect(loadExternalSearchBrowseEntries('folder-1').find((entry) => entry.absolute_path === filePath)).toMatchObject({
    absolute_path: filePath,
    imported_node_id: null
  });
  expect(searchExternalDocuments('visible body').map((entry) => entry.id)).toContain(filePath);
});

it('keeps Windows path casing differences occupied for external search visibility', async () => {
  const libraryRoot = path.join(tempRoot, 'library-case');
  const filePath = path.join(libraryRoot, 'Alpha.md');
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
  const nodeId = await importDocument(filePath);
  openDatabaseConnection().sqlite
    .prepare(`UPDATE import_sources SET source_locator = ? WHERE latest_node_id = ?`)
    .run(filePath.replace('Alpha.md', 'ALPHA.md'), nodeId);

  expect(loadExternalSearchBrowseEntries('folder-1').find((entry) => entry.absolute_path === filePath)).toMatchObject({
    imported_node_id: nodeId
  });
  expect(searchExternalDocuments('visible body').map((entry) => entry.id)).not.toContain(filePath);
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

  const nodeId = await importDocument(filePath);
  const importedEntry = loadExternalSearchBrowseEntries('readwise-reader-import-articles').find((entry) => entry.absolute_path === filePath);
  expect(importedEntry).toMatchObject({ absolute_path: filePath, imported_node_id: nodeId });
  expect(searchExternalDocuments('visible body').map((entry) => entry.id)).not.toContain(filePath);

  softDeleteNodes({ deletedAt: '2026-05-12T00:00:00.000Z', nodeIds: [nodeId] });

  expect(loadExternalSearchBrowseEntries('readwise-reader-import-articles').find((entry) => entry.absolute_path === filePath)).toMatchObject({
    absolute_path: filePath,
    imported_node_id: nodeId
  });
  expect(searchExternalDocuments('visible body').map((entry) => entry.id)).not.toContain(filePath);

  deleteNodesPermanently({ nodeIds: [nodeId], nodeOrder: readNodeOrder() });

  expect(loadExternalSearchBrowseEntries('readwise-reader-import-articles').find((entry) => entry.absolute_path === filePath)).toMatchObject({
    absolute_path: filePath,
    imported_node_id: null
  });
  expect(searchExternalDocuments('visible body').map((entry) => entry.id)).toContain(filePath);
});
