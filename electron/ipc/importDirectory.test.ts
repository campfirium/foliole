// @vitest-environment node

import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { recordPreparedImportFailure, runPreparedImport } = vi.hoisted(() => ({
  recordPreparedImportFailure: vi.fn(),
  runPreparedImport: vi.fn()
}));

const { resolveAppPaths } = vi.hoisted(() => ({
  resolveAppPaths: vi.fn()
}));
const { ensureLibraryPathLayout, loadLibraryPathSettings, loadLibraryPathSettingsSync } = vi.hoisted(() => ({
  ensureLibraryPathLayout: vi.fn(), loadLibraryPathSettings: vi.fn(), loadLibraryPathSettingsSync: vi.fn()
}));
const { logDirectoryImportCompleted, logDirectoryImportFailed } = vi.hoisted(() => ({
  logDirectoryImportCompleted: vi.fn(),
  logDirectoryImportFailed: vi.fn()
}));
const { trashItem } = vi.hoisted(() => ({
  trashItem: vi.fn(async (filePath: string) => {
    await fs.rm(filePath, { force: true });
  })
}));
const { notifyManagedInboxUpdated } = vi.hoisted(() => ({
  notifyManagedInboxUpdated: vi.fn()
}));
const { persistSecurityScopedBookmark, shouldRequestSecurityScopedBookmarks, showOpenDialog } = vi.hoisted(() => ({
  persistSecurityScopedBookmark: vi.fn(),
  shouldRequestSecurityScopedBookmarks: vi.fn(() => true),
  showOpenDialog: vi.fn()
}));

vi.mock('../database/importPipeline.js', () => ({
  recordPreparedImportFailure,
  runPreparedImport
}));

vi.mock('../import/importRunLogger.js', () => ({
  logDirectoryImportCompleted,
  logDirectoryImportFailed
}));
vi.mock('../import/importManagerSettings.js', () => ({ loadImportManagerSettings: () => ({ titleStrategy: 'file_name' }) }));
vi.mock('../import/importNodeMutationPatch.js', () => ({ withDirectoryImportNodeMutationPatch: <T>(result: T) => result }));
vi.mock('./paths.js', () => ({ resolveAppPaths }));
vi.mock('./libraryPaths.js', () => ({ ensureLibraryPathLayout, loadLibraryPathSettings, loadLibraryPathSettingsSync }));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated }));
vi.mock('../securityScopedBookmarks.js', () => ({
  persistSecurityScopedBookmark,
  shouldRequestSecurityScopedBookmarks
}));
vi.mock('electron', () => ({
  BrowserWindow: {},
  dialog: { showOpenDialog },
  shell: { trashItem }
}));

import { runDirectoryImport } from './importDirectory.js';
import { createPersistedRecord, createTempRoot } from './importDirectory.test-support.js';
import {
  authorizeSelectedImportDirectoryPath,
  resetImportPathAuthorizationForTests
} from './importPathAuthorization.js';

const tempRoots: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  resetImportPathAuthorizationForTests();
  logDirectoryImportCompleted.mockResolvedValue(undefined);
  logDirectoryImportFailed.mockResolvedValue(undefined);
  resolveAppPaths.mockReturnValue({
    app_cache_dir: '/tmp/cache',
    app_config_dir: '/tmp/config',
    app_data_dir: '/tmp/app-data',
    app_log_dir: '/tmp/logs'
  });
  loadLibraryPathSettings.mockResolvedValue({ inbox: '/tmp/app-data/Inbox', mirror: '/tmp/app-data/Mirror' });
  loadLibraryPathSettingsSync.mockReturnValue({
    assets_dir: '/tmp/app-data/Assets',
    data_dir: '/tmp/app-data/Data',
    database_path: '/tmp/app-data/Data/foliole.db',
    inbox: '/tmp/app-data/Inbox',
    library_home: '/tmp/app-data',
    mirror: '/tmp/app-data/Mirror',
    updated_at: '2026-05-30T00:00:00.000Z'
  });
  runPreparedImport.mockImplementation((prepared) => createPersistedRecord(prepared));
  recordPreparedImportFailure.mockImplementation((prepared, failureReason: string) =>
    createPersistedRecord(prepared, { failureReason, nodeId: null, resultStatus: 'failed' })
  );
});

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

async function createGenericImportRoot() {
  const root = await createTempRoot('import-directory-generic', tempRoots);
  await fs.writeFile(path.join(root, 'a-note.md'), 'Use ==important== text', 'utf8');
  await fs.mkdir(path.join(root, 'b-web'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'b-web', 'embed.html'),
    '<table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>Beta</td></tr></table>',
    'utf8'
  );
  return root;
}

function expectGenericImportResult(result: Awaited<ReturnType<typeof runDirectoryImport>>, root: string) {
  expect(result).toEqual({
    archive_root_path: null,
    consume_policy: 'keep',
    consumed_count: 0,
    discovered_count: 2,
    entries: [
      expect.objectContaining({
        adapter: 'markdown_directory',
        degraded_reason: null,
        result_status: 'imported',
        source_name: 'a-note.md'
      }),
      expect.objectContaining({
        adapter: 'html_directory',
        degraded_reason: null,
        result_status: 'imported',
        source_name: path.join('b-web', 'embed.html')
      })
    ],
    failed_count: 0,
    imported_count: 2,
    root_path: root,
    source_adapter: 'external_directory'
  });
}

function expectGenericPreparedImports() {
  expect(runPreparedImport).toHaveBeenCalledTimes(2);
  expect(runPreparedImport.mock.calls).toEqual(
    expect.arrayContaining([
      [
        expect.objectContaining({
          content: 'Use important text',
          degradedReason: null,
          matchedHighlights: [{ content: 'important', label: null }],
          sourceKind: 'markdown',
          sourceName: 'a-note.md'
        })
      ],
      [
        expect.objectContaining({
          content: '| Name | Value |\n| --- | --- |\n| Alpha | Beta |',
          degradedReason: null,
          sourceKind: 'html',
          sourceName: path.join('b-web', 'embed.html')
        })
      ]
    ])
  );
}

it('imports markdown and HTML directories through the shared normalization and persistence pipeline', async () => {
  const root = await createGenericImportRoot();
  await authorizeSelectedImportDirectoryPath(root);

  const result = await runDirectoryImport(undefined, { directory_path: root, highlight_policy: 'adopt' });

  expectGenericImportResult(result, root);
  expectGenericPreparedImports();
  expect(recordPreparedImportFailure).not.toHaveBeenCalled();
  expect(logDirectoryImportCompleted).toHaveBeenCalledWith(
    expect.objectContaining({
      discovered_count: 2,
      source_adapter: 'external_directory'
    })
  );
  expect(notifyManagedInboxUpdated.mock.calls[0]?.[0]).toEqual(expect.any(String));
});

it('persists the MAS bookmark returned by the directory picker', async () => {
  const root = await createGenericImportRoot();
  showOpenDialog.mockResolvedValue({ bookmarks: ['bookmark-data'], canceled: false, filePaths: [root] });

  await expect(runDirectoryImport()).resolves.toMatchObject({ root_path: root });

  expect(showOpenDialog).toHaveBeenCalledWith({
    properties: ['openDirectory'],
    securityScopedBookmarks: true
  });
  expect(persistSecurityScopedBookmark).toHaveBeenCalledWith(root, 'bookmark-data');
});

it('rejects renderer-provided directory paths that were not selected by the main process', async () => {
  const root = await createGenericImportRoot();

  await expect(runDirectoryImport(undefined, { directory_path: root })).rejects.toThrow('Import directory path is not authorized.');
});

it('classifies vault markdown as obsidian imports and skips the .obsidian control directory', async () => {
  const root = await createTempRoot('import-directory-obsidian', tempRoots);
  await fs.mkdir(path.join(root, '.obsidian'), { recursive: true });
  await fs.writeFile(path.join(root, '.obsidian', 'ignored.md'), '# hidden', 'utf8');
  await fs.mkdir(path.join(root, 'Daily'), { recursive: true });
  await fs.writeFile(path.join(root, 'Daily', 'note.md'), '# Imported vault note', 'utf8');
  await authorizeSelectedImportDirectoryPath(root);

  const result = await runDirectoryImport(undefined, { directory_path: root });

  expect(result).toEqual({
    archive_root_path: null,
    consume_policy: 'keep',
    consumed_count: 0,
    discovered_count: 1,
    entries: [
      expect.objectContaining({
        adapter: 'obsidian_vault',
        result_status: 'imported',
        source_name: path.join('Daily', 'note.md')
      })
    ],
    failed_count: 0,
    imported_count: 1,
    root_path: root,
    source_adapter: 'external_directory'
  });
  expect(runPreparedImport).toHaveBeenCalledTimes(1);
  expect(runPreparedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      content: '# Imported vault note',
      sourceKind: 'markdown',
      sourceName: path.join('Daily', 'note.md')
    })
  );
  expect(logDirectoryImportCompleted).toHaveBeenCalledWith(
    expect.objectContaining({
      discovered_count: 1,
      source_adapter: 'external_directory'
    })
  );
  expect(notifyManagedInboxUpdated.mock.calls[0]?.[0]).toEqual(expect.any(String));
});
