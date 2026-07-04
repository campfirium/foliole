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
    documents_dir: mockedDocumentsDir,
    app_log_dir: '/log'
  })
}));
vi.mock('./storage.js', () => ({ loadAppSettingsState }));
vi.mock('../database/settingsStore.js', () => settingsStore);

import {
  loadLibraryPathSettings,
  loadLibraryPathSettingsSync,
  updateLibraryPathSetting
} from './libraryPaths.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-library-paths-'));
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  mockedAppConfigDir = path.join(tempRoot, 'config');
  loadAppSettingsState.mockReset();
  loadAppSettingsState.mockResolvedValue({});
  settingsStore.loadJsonSetting.mockReset();
  settingsStore.loadJsonSetting.mockReturnValue(null);
  settingsStore.saveJsonSetting.mockReset();
  settingsStore.saveJsonSetting.mockImplementation((_key, payload) => {
    settingsStore.loadJsonSetting.mockReturnValue(payload);
  });
  electronShell.openPath.mockReset();
  electronShell.openPath.mockResolvedValue('');
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

async function writeStoredLibraryPathSettings(value: unknown) {
  settingsStore.loadJsonSetting.mockReturnValue(value);
}

async function writeLegacyLibraryPathSettings(value: unknown) {
  const settingsPath = path.join(mockedAppConfigDir, 'library-path-settings.json');
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(value), 'utf8');
}

it('loads default library paths under Documents/Foliole with internal Data and Assets rules', async () => {
  await expect(loadLibraryPathSettings()).resolves.toEqual({
    assets_dir: path.join(mockedDocumentsDir, 'Foliole', 'Assets'),
    data_dir: path.join(mockedDocumentsDir, 'Foliole', 'Data'),
    database_path: path.join(mockedDocumentsDir, 'Foliole', 'Data', 'foliole.db'),
    inbox: path.join(mockedDocumentsDir, 'Foliole', 'Import', 'Inbox'),
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

it('adopts the legacy library home file only as a read fallback', async () => {
  const legacyLibraryHome = path.join(tempRoot, 'LegacyLibrary');
  await writeLegacyLibraryPathSettings({
    assets_dir: null,
    inbox: null,
    library_home: legacyLibraryHome,
    mirror: null,
    updated_at: '2026-05-13T00:00:00.000Z'
  });

  await expect(loadLibraryPathSettings()).resolves.toMatchObject({
    data_dir: path.join(legacyLibraryHome, 'Data'),
    library_home: legacyLibraryHome
  });
});

it('rejects stored library path settings with invalid field types', async () => {
  const legacyInboxPath = path.join(tempRoot, 'LegacyInbox');
  loadAppSettingsState.mockResolvedValue({ 'foliole-managed-inbox-path': legacyInboxPath });
  await writeStoredLibraryPathSettings({
    inbox: 42,
    library_home: path.join(tempRoot, 'CustomLibrary'),
    mirror: path.join(tempRoot, 'MirrorVault'),
    updated_at: '2026-05-13T00:00:00.000Z'
  });

  await expect(loadLibraryPathSettings()).resolves.toMatchObject({
    inbox: legacyInboxPath,
    library_home: path.join(mockedDocumentsDir, 'Foliole'),
    mirror: path.join(mockedDocumentsDir, 'Foliole', 'Mirror')
  });
});

it('rejects non-object stored library path settings on async and sync loads', async () => {
  await writeStoredLibraryPathSettings(['not', 'settings']);

  await expect(loadLibraryPathSettings()).resolves.toMatchObject({
    inbox: path.join(mockedDocumentsDir, 'Foliole', 'Import', 'Inbox'),
    library_home: path.join(mockedDocumentsDir, 'Foliole')
  });
  expect(loadLibraryPathSettingsSync()).toMatchObject({
    inbox: path.join(mockedDocumentsDir, 'Foliole', 'Import', 'Inbox'),
    library_home: path.join(mockedDocumentsDir, 'Foliole')
  });
});

it('keeps value validation as a single-field fallback for stored path strings', async () => {
  const mirrorPath = path.join(tempRoot, 'MirrorVault');
  await writeStoredLibraryPathSettings({
    library_home: 'relative/library',
    mirror: mirrorPath,
    updated_at: ''
  });

  await expect(loadLibraryPathSettings()).resolves.toMatchObject({
    library_home: path.join(mockedDocumentsDir, 'Foliole'),
    mirror: mirrorPath,
    updated_at: '1970-01-01T00:00:00.000Z'
  });
});

it('updates and persists a single library path override', async () => {
  const mirrorPath = path.join(tempRoot, 'MirrorVault');

  await expect(updateLibraryPathSetting({ location: 'mirror', path: mirrorPath })).resolves.toMatchObject({
    mirror: mirrorPath
  });

  expect(settingsStore.saveJsonSetting).toHaveBeenCalledWith(
    'library_path_settings',
    expect.objectContaining({ mirror: mirrorPath }),
    expect.any(String)
  );
});

it('stores Library Home switches in the bootstrap pointer instead of runtime settings', async () => {
  const nextLibraryHome = path.join(tempRoot, 'NextLibrary');

  await updateLibraryPathSetting({ location: 'library_home', path: nextLibraryHome });

  const pointer = JSON.parse(
    await fs.readFile(path.join(mockedAppConfigDir, 'current-library.json'), 'utf8')
  ) as Record<string, unknown>;
  expect(pointer.library_home).toBe(nextLibraryHome);
  expect(settingsStore.saveJsonSetting).not.toHaveBeenCalled();
});

it('restores Library Home to the real default without falling back to legacy settings', async () => {
  const nextLibraryHome = path.join(tempRoot, 'NextLibrary');
  const legacyLibraryHome = path.join(tempRoot, 'LegacyLibrary');
  await writeLegacyLibraryPathSettings({ library_home: legacyLibraryHome });
  await updateLibraryPathSetting({ location: 'library_home', path: nextLibraryHome });

  await expect(updateLibraryPathSetting({ location: 'library_home', path: null })).resolves.toMatchObject({
    library_home: path.join(mockedDocumentsDir, 'Foliole')
  });

  const pointer = JSON.parse(
    await fs.readFile(path.join(mockedAppConfigDir, 'current-library.json'), 'utf8')
  ) as Record<string, unknown>;
  expect(pointer).toMatchObject({ library_home: null, use_default: true });
  await expect(loadLibraryPathSettings()).resolves.toMatchObject({
    library_home: path.join(mockedDocumentsDir, 'Foliole')
  });
});

it('restores Library Home to the explicit launch home without appending the default folder name', async () => {
  const explicitLibraryHome = path.join(tempRoot, 'ExplicitLibrary');
  const nextLibraryHome = path.join(tempRoot, 'NextLibrary');
  process.env.FOLIOLE_LIBRARY_HOME = explicitLibraryHome;
  try {
    await updateLibraryPathSetting({ location: 'library_home', path: nextLibraryHome });

    await expect(updateLibraryPathSetting({ location: 'library_home', path: null })).resolves.toMatchObject({
      library_home: explicitLibraryHome
    });
  } finally {
    delete process.env.FOLIOLE_LIBRARY_HOME;
  }
});

it('rejects inbox and mirror locations that overlap', async () => {
  const inboxPath = path.join(tempRoot, 'Capture');
  const mirrorInsideInbox = path.join(inboxPath, 'Mirror');
  await updateLibraryPathSetting({ location: 'inbox', path: inboxPath });

  await expect(updateLibraryPathSetting({ location: 'mirror', path: mirrorInsideInbox })).rejects.toThrow(
    'Inbox cannot overlap Mirror.'
  );
  await expect(updateLibraryPathSetting({ location: 'mirror', path: inboxPath })).rejects.toThrow(
    'Inbox cannot overlap Mirror.'
  );
});

it('rejects managed child folders that overlap assets or data', async () => {
  const assetsPath = path.join(tempRoot, 'AttachmentVault');
  await updateLibraryPathSetting({ location: 'assets_dir', path: assetsPath });

  await expect(updateLibraryPathSetting({ location: 'inbox', path: path.join(assetsPath, 'Inbox') })).rejects.toThrow(
    'Assets cannot overlap Inbox.'
  );
  await expect(updateLibraryPathSetting({ location: 'mirror', path: path.join(mockedDocumentsDir, 'Foliole', 'Data') })).rejects.toThrow(
    'Data cannot overlap Mirror.'
  );
});

it('rejects non-absolute library path updates', async () => {
  await expect(updateLibraryPathSetting({ location: 'inbox', path: 'relative/inbox' })).rejects.toThrow(
    'library path must be an absolute path: inbox'
  );
});
