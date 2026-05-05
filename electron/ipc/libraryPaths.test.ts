// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedDocumentsDir = '/documents';
let mockedAppConfigDir = '/config';
const { loadAppSettingsState } = vi.hoisted(() => ({
  loadAppSettingsState: vi.fn()
}));

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: '/cache',
    app_config_dir: mockedAppConfigDir,
    app_data_dir: '/data',
    documents_dir: mockedDocumentsDir,
    app_log_dir: '/log'
  })
}));
vi.mock('./storage.js', () => ({ loadAppSettingsState }));

import {
  loadLibraryPathSettings,
  resolveLibraryPathSettingsFileForTest,
  updateLibraryPathSetting
} from './libraryPaths.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-library-paths-'));
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  mockedAppConfigDir = path.join(tempRoot, 'config');
  loadAppSettingsState.mockReset();
  loadAppSettingsState.mockResolvedValue({});
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('loads default library paths under Documents/Foliole with internal Data and Assets rules', async () => {
  await expect(loadLibraryPathSettings()).resolves.toEqual({
    assets_dir: path.join(mockedDocumentsDir, 'Foliole', 'Assets'),
    data_dir: path.join(mockedDocumentsDir, 'Foliole', 'Data'),
    database_path: path.join(mockedDocumentsDir, 'Foliole', 'Data', 'foliole.db'),
    inbox: path.join(mockedDocumentsDir, 'Foliole', 'Inbox'),
    library_home: path.join(mockedDocumentsDir, 'Foliole'),
    mirror: path.join(mockedDocumentsDir, 'Foliole', 'Mirror'),
    updated_at: '1970-01-01T00:00:00.000Z'
  });
});

it('persists a custom assets path override separately from Library Home', async () => {
  const assetsPath = path.join(tempRoot, 'AttachmentVault');

  await expect(updateLibraryPathSetting({ location: 'assets_dir', path: assetsPath })).resolves.toMatchObject({
    assets_dir: assetsPath,
    library_home: path.join(mockedDocumentsDir, 'Foliole')
  });

  await expect(loadLibraryPathSettings()).resolves.toMatchObject({
    assets_dir: assetsPath,
    library_home: path.join(mockedDocumentsDir, 'Foliole')
  });
});

it('falls back to the legacy managed inbox override before the new file is written', async () => {
  const legacyInboxPath = path.join(tempRoot, 'LegacyInbox');
  loadAppSettingsState.mockResolvedValue({ 'foliole-managed-inbox-path': legacyInboxPath });

  await expect(loadLibraryPathSettings()).resolves.toMatchObject({
    inbox: legacyInboxPath,
    library_home: path.join(mockedDocumentsDir, 'Foliole')
  });
});

it('updates and persists a single library path override', async () => {
  const mirrorPath = path.join(tempRoot, 'MirrorVault');

  await expect(updateLibraryPathSetting({ location: 'mirror', path: mirrorPath })).resolves.toMatchObject({
    mirror: mirrorPath
  });

  await expect(fs.readFile(resolveLibraryPathSettingsFileForTest(), 'utf8')).resolves.toContain(mirrorPath);
});

it('rejects non-absolute library path updates', async () => {
  await expect(updateLibraryPathSetting({ location: 'inbox', path: 'relative/inbox' })).rejects.toThrow(
    'library path must be an absolute path: inbox'
  );
});
