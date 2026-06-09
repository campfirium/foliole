// @vitest-environment node

import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { recordPreparedImportFailure, runPreparedImport } = vi.hoisted(() => ({
  recordPreparedImportFailure: vi.fn(),
  runPreparedImport: vi.fn()
}));
const { resolveAppPaths } = vi.hoisted(() => ({ resolveAppPaths: vi.fn() }));
const { loadLibraryPathSettings, loadLibraryPathSettingsSync } = vi.hoisted(() => ({
  loadLibraryPathSettings: vi.fn(),
  loadLibraryPathSettingsSync: vi.fn()
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
const { notifyManagedInboxUpdated } = vi.hoisted(() => ({ notifyManagedInboxUpdated: vi.fn() }));

vi.mock('../database/importPipeline.js', () => ({ recordPreparedImportFailure, runPreparedImport }));
vi.mock('../import/importRunLogger.js', () => ({ logDirectoryImportCompleted, logDirectoryImportFailed }));
vi.mock('./paths.js', () => ({ resolveAppPaths }));
vi.mock('./libraryPaths.js', () => ({ loadLibraryPathSettings, loadLibraryPathSettingsSync }));
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
  runPreparedImport.mockImplementation((prepared) => createPersistedRecord(prepared));
  recordPreparedImportFailure.mockImplementation((prepared, failureReason: string) =>
    createPersistedRecord(prepared, { failureReason, nodeId: null, resultStatus: 'failed' })
  );
});

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

it('resolves the managed inbox folder from runtime settings and trashes only imported sources', async () => {
  const appDataDir = await createTempRoot('managed-inbox-runtime', tempRoots);
  const managedRoot = path.join(appDataDir, 'custom-inbox');
  const failedPath = path.join(managedRoot, 'failed.md');
  const importedPath = path.join(managedRoot, 'clips', 'saved-page.html');
  resolveAppPaths.mockReturnValue({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  });
  loadLibraryPathSettings.mockResolvedValue({ inbox: managedRoot, mirror: path.join(appDataDir, 'Mirror') });
  loadLibraryPathSettingsSync.mockReturnValue({
    assets_dir: path.join(appDataDir, 'Assets'),
    data_dir: path.join(appDataDir, 'Data'),
    database_path: path.join(appDataDir, 'Data', 'foliole.db'),
    inbox: managedRoot,
    library_home: appDataDir,
    mirror: path.join(appDataDir, 'Mirror'),
    updated_at: '2026-05-30T00:00:00.000Z'
  });
  await fs.mkdir(path.dirname(importedPath), { recursive: true });
  await fs.writeFile(importedPath, '<html><body><h1>Imported managed page</h1></body></html>', 'utf8');
  await fs.writeFile(failedPath, '# Failed managed note', 'utf8');
  runPreparedImport.mockImplementation((prepared) => {
    if (prepared.sourceName === 'failed.md') throw new Error('boom');
    return createPersistedRecord(prepared);
  });

  const result = await runDirectoryImport(undefined, { source_adapter: 'foliole_managed_inbox_folder' });
  if (!result) {
    throw new Error('expected managed inbox import result');
  }

  expect(result).toEqual(expect.objectContaining({ consumed_count: 1, discovered_count: 2, failed_count: 1 }));
  expect(result.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        result_status: 'imported',
        source_kind: 'html',
        source_name: path.join('clips', 'saved-page.html')
      })
    ])
  );
  await expect(fs.stat(importedPath)).rejects.toThrow();
  await expect(fs.readFile(failedPath, 'utf8')).resolves.toBe('# Failed managed note');
  expect(trashItem).toHaveBeenCalledWith(importedPath);
  expect(recordPreparedImportFailure).toHaveBeenCalledTimes(1);
  expect(logDirectoryImportCompleted).toHaveBeenCalledWith(
    expect.objectContaining({ failed_count: 1, source_adapter: 'foliole_managed_inbox_folder' })
  );
  expect(notifyManagedInboxUpdated.mock.calls[0]?.[0]).toEqual(expect.any(String));
});
