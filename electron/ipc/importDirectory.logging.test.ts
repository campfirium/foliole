// @vitest-environment node

import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { recordPreparedImportFailure, runPreparedImport } = vi.hoisted(() => ({
  recordPreparedImportFailure: vi.fn(),
  runPreparedImport: vi.fn()
}));
const { logDirectoryImportCompleted, logDirectoryImportFailed } = vi.hoisted(() => ({
  logDirectoryImportCompleted: vi.fn(),
  logDirectoryImportFailed: vi.fn()
}));
const { resolveAppPaths } = vi.hoisted(() => ({
  resolveAppPaths: vi.fn()
}));
const { loadAppSettingsState } = vi.hoisted(() => ({
  loadAppSettingsState: vi.fn()
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
vi.mock('./storage.js', () => ({ loadAppSettingsState }));
vi.mock('electron', () => ({
  BrowserWindow: {},
  dialog: { showOpenDialog: vi.fn() },
  shell: { trashItem: vi.fn() }
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { runDirectoryImport } from './importDirectory.js';
import { createTempRoot } from './importDirectory.test-support.js';

const tempRoots: string[] = [];

beforeEach(async () => {
  const appDataDir = await createTempRoot('import-directory-logging-app-data', tempRoots);
  vi.clearAllMocks();
  logDirectoryImportCompleted.mockResolvedValue(undefined);
  logDirectoryImportFailed.mockResolvedValue(undefined);
  resolveAppPaths.mockReturnValue({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  });
  loadAppSettingsState.mockResolvedValue({});
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

it('records a failed directory import attempt before rethrowing the error', async () => {
  const root = await createTempRoot('import-directory-failure', tempRoots);
  const failure = new Error('discover failed');
  await fs.writeFile(path.join(root, 'a-note.md'), 'Use ==important== text', 'utf8');
  runPreparedImport.mockImplementation(() => {
    throw failure;
  });
  recordPreparedImportFailure.mockImplementation(() => {
    throw failure;
  });

  await expect(runDirectoryImport(undefined, { directory_path: root })).rejects.toThrow('discover failed');

  expect(logDirectoryImportFailed).toHaveBeenCalledWith('external_directory', failure);
});
