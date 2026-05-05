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
const { loadLibraryPathSettings } = vi.hoisted(() => ({
  loadLibraryPathSettings: vi.fn()
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

vi.mock('../database/importPipeline.js', () => ({
  recordPreparedImportFailure,
  runPreparedImport
}));

vi.mock('../import/importRunLogger.js', () => ({
  logDirectoryImportCompleted,
  logDirectoryImportFailed
}));
vi.mock('./paths.js', () => ({ resolveAppPaths }));
vi.mock('./libraryPaths.js', () => ({ loadLibraryPathSettings }));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated }));
vi.mock('electron', () => ({
  BrowserWindow: {},
  dialog: { showOpenDialog: vi.fn() },
  shell: { trashItem }
}));

import { runDirectoryImport } from './importDirectory.js';
import { createPersistedRecord, createTempRoot } from './importDirectory.test-support.js';

const tempRoots: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  logDirectoryImportCompleted.mockResolvedValue(undefined);
  logDirectoryImportFailed.mockResolvedValue(undefined);
  resolveAppPaths.mockReturnValue({
    app_cache_dir: '/tmp/cache',
    app_config_dir: '/tmp/config',
    app_data_dir: '/tmp/app-data',
    app_log_dir: '/tmp/logs'
  });
  loadLibraryPathSettings.mockResolvedValue({ inbox: '/tmp/app-data/Inbox' });
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
        degraded_reason: 'HTML conversion degraded: table',
        result_status: 'degraded',
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
          content: 'Use <highlight id="1">important</highlight id="1"> text',
          degradedReason: null,
          sourceKind: 'markdown',
          sourceName: 'a-note.md'
        })
      ],
      [
        expect.objectContaining({
          content: '[Table degraded]\nName | Value\nAlpha | Beta',
          degradedReason: 'HTML conversion degraded: table',
          sourceKind: 'html',
          sourceName: path.join('b-web', 'embed.html')
        })
      ]
    ])
  );
}

it('imports markdown and HTML directories through the shared normalization and persistence pipeline', async () => {
  const root = await createGenericImportRoot();

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
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith(expect.any(String));
});

it('classifies vault markdown as obsidian imports and skips the .obsidian control directory', async () => {
  const root = await createTempRoot('import-directory-obsidian', tempRoots);
  await fs.mkdir(path.join(root, '.obsidian'), { recursive: true });
  await fs.writeFile(path.join(root, '.obsidian', 'ignored.md'), '# hidden', 'utf8');
  await fs.mkdir(path.join(root, 'Daily'), { recursive: true });
  await fs.writeFile(path.join(root, 'Daily', 'note.md'), '# Imported vault note', 'utf8');

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
      content: '## Imported vault note',
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
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith(expect.any(String));
});

it('resolves the managed inbox folder from runtime settings and trashes only imported sources', async () => {
  const appDataDir = await createTempRoot('managed-inbox-runtime', tempRoots);
  const managedRoot = path.join(appDataDir, 'custom-inbox');
  const failedPath = path.join(managedRoot, 'failed.md');
  const importedPath = path.join(managedRoot, 'clips', 'note.txt');
  resolveAppPaths.mockReturnValue({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  });
  loadLibraryPathSettings.mockResolvedValue({ inbox: managedRoot });
  await fs.mkdir(path.dirname(importedPath), { recursive: true });
  await fs.writeFile(importedPath, 'Imported managed note', 'utf8');
  await fs.writeFile(failedPath, '# Failed managed note', 'utf8');
  runPreparedImport.mockImplementation((prepared) => {
    if (prepared.sourceName === 'failed.md') {
      throw new Error('boom');
    }
    return createPersistedRecord(prepared);
  });

  const result = await runDirectoryImport(undefined, {
    source_adapter: 'foliole_managed_inbox_folder'
  });

  expect(result).toEqual({
    archive_root_path: null,
    consume_policy: 'clear',
    consumed_count: 1,
    discovered_count: 2,
    entries: [
      expect.objectContaining({
        adapter: 'text_directory',
        result_status: 'imported',
        source_name: path.join('clips', 'note.txt')
      }),
      expect.objectContaining({
        adapter: 'markdown_directory',
        failure_reason: 'boom',
        result_status: 'failed',
        source_name: 'failed.md'
      })
    ],
    failed_count: 1,
    imported_count: 1,
    root_path: managedRoot,
    source_adapter: 'foliole_managed_inbox_folder'
  });
  await expect(fs.stat(importedPath)).rejects.toThrow();
  await expect(fs.readFile(failedPath, 'utf8')).resolves.toBe('# Failed managed note');
  expect(trashItem).toHaveBeenCalledWith(importedPath);
  expect(recordPreparedImportFailure).toHaveBeenCalledTimes(1);
  expect(logDirectoryImportCompleted).toHaveBeenCalledWith(
    expect.objectContaining({
      failed_count: 1,
      source_adapter: 'foliole_managed_inbox_folder'
    })
  );
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith(expect.any(String));
});
