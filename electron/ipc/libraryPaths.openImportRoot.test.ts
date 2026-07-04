// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedDocumentsDir = '/documents';
let mockedAppConfigDir = '/config';
const electronShell = vi.hoisted(() => ({
  openPath: vi.fn()
}));
const settingsStore = vi.hoisted(() => ({
  loadJsonSetting: vi.fn(),
  saveJsonSetting: vi.fn()
}));

vi.mock('electron', () => ({ shell: electronShell }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: '/cache',
    app_config_dir: mockedAppConfigDir,
    app_data_dir: '/data',
    app_log_dir: '/log',
    documents_dir: mockedDocumentsDir
  })
}));
vi.mock('./storage.js', () => ({ loadAppSettingsState: vi.fn().mockResolvedValue({}) }));
vi.mock('../database/settingsStore.js', () => settingsStore);

import { openImportRoot, updateLibraryPathSetting } from './libraryPaths.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-root-open-'));
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  mockedAppConfigDir = path.join(tempRoot, 'config');
  settingsStore.loadJsonSetting.mockReturnValue(null);
  settingsStore.saveJsonSetting.mockImplementation((_key, payload) => {
    settingsStore.loadJsonSetting.mockReturnValue(payload);
  });
  electronShell.openPath.mockReset();
  electronShell.openPath.mockResolvedValue('');
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('opens the Import root from the authoritative Library Home setting', async () => {
  const nextLibraryHome = path.join(tempRoot, 'ExternalLibrary');
  await updateLibraryPathSetting({ location: 'library_home', path: nextLibraryHome });

  await expect(openImportRoot()).resolves.toBeNull();

  const importRoot = path.join(nextLibraryHome, 'Import');
  const importRootStats = await fs.stat(importRoot);
  expect(importRootStats.isDirectory()).toBe(true);
  expect(electronShell.openPath).toHaveBeenCalledWith(importRoot);
});
