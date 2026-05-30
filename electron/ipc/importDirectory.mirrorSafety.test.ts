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

vi.mock('../database/importPipeline.js', () => ({ recordPreparedImportFailure, runPreparedImport }));
vi.mock('../import/importRunLogger.js', () => ({ logDirectoryImportCompleted, logDirectoryImportFailed }));
vi.mock('./paths.js', () => ({ resolveAppPaths }));
vi.mock('./libraryPaths.js', () => ({ loadLibraryPathSettings, loadLibraryPathSettingsSync }));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: vi.fn() }));
vi.mock('electron', () => ({
  BrowserWindow: {},
  dialog: { showOpenDialog: vi.fn() },
  shell: { trashItem: vi.fn() }
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

it('rejects importing an external parent directory that contains mirror output', async () => {
  const root = await createTempRoot('import-directory-mirror-parent', tempRoots);
  const mirrorPath = path.join(root, 'Mirror');
  await fs.writeFile(path.join(root, 'source.md'), '# Source', 'utf8');
  await fs.mkdir(mirrorPath, { recursive: true });
  await fs.writeFile(path.join(mirrorPath, 'exported.md'), '# Exported mirror', 'utf8');
  loadLibraryPathSettings.mockResolvedValue({ inbox: '/tmp/app-data/Inbox', mirror: mirrorPath });
  loadLibraryPathSettingsSync.mockReturnValue({
    assets_dir: '/tmp/app-data/Assets',
    data_dir: '/tmp/app-data/Data',
    database_path: '/tmp/app-data/Data/foliole.db',
    inbox: '/tmp/app-data/Inbox',
    library_home: '/tmp/app-data',
    mirror: mirrorPath,
    updated_at: '2026-05-30T00:00:00.000Z'
  });

  await expect(runDirectoryImport(undefined, { directory_path: root })).rejects.toThrow(
    'Mirror cannot overlap Imported folder.'
  );
  expect(runPreparedImport).not.toHaveBeenCalled();
});

it('rejects managed inbox imports when the inbox overlaps mirror output', async () => {
  const appDataDir = await createTempRoot('managed-inbox-mirror-overlap', tempRoots);
  const mirrorPath = path.join(appDataDir, 'Mirror');
  resolveAppPaths.mockReturnValue({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  });
  loadLibraryPathSettings.mockResolvedValue({ inbox: mirrorPath, mirror: mirrorPath });
  loadLibraryPathSettingsSync.mockReturnValue({
    assets_dir: path.join(appDataDir, 'Assets'),
    data_dir: path.join(appDataDir, 'Data'),
    database_path: path.join(appDataDir, 'Data', 'foliole.db'),
    inbox: mirrorPath,
    library_home: appDataDir,
    mirror: mirrorPath,
    updated_at: '2026-05-30T00:00:00.000Z'
  });

  await expect(runDirectoryImport(undefined, { source_adapter: 'foliole_managed_inbox_folder' })).rejects.toThrow(
    'Inbox cannot overlap the Mirror output folder.'
  );
  expect(runPreparedImport).not.toHaveBeenCalled();
  expect(logDirectoryImportFailed).toHaveBeenCalledWith('foliole_managed_inbox_folder', expect.any(Error));
});
