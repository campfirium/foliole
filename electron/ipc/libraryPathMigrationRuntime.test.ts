// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-library-path-runtime-app-data';
let mockedDocumentsDir = '/tmp/foliole-library-path-runtime-documents';

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('./storage.js', () => ({ loadAppSettingsState: vi.fn().mockResolvedValue({}) }));

import { openDatabaseConnection } from '../database/connection.js';
import { resetSeededWorkspace } from '../database/databaseTestWorkspace.js';
import { openExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';

import { loadLibraryPathSettings, updateLibraryPathSetting } from './libraryPaths.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-library-path-runtime-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
});

afterEach(async () => {
  const { closeDatabaseConnection } = await import('../database/connection.js');
  closeDatabaseConnection();
  try {
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 });
  } catch (error) {
    if (!['EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      throw error;
    }
  }
}, 30_000);

it('blocks database reopen while Library Home data is moving', async () => {
  const initialPaths = await loadLibraryPathSettings();
  initializeDatabase();
  resetSeededWorkspace();
  const originalRename = fs.rename.bind(fs);
  let blockedMainOpen = false;
  let blockedExternalOpen = false;
  const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (sourcePath, targetPath) => {
    if (sourcePath === initialPaths.data_dir) {
      expect(() => openDatabaseConnection()).toThrow('library_home_migration_in_progress');
      expect(() => openExternalSearchCacheDatabase()).toThrow('library_home_migration_in_progress');
      blockedMainOpen = true;
      blockedExternalOpen = true;
    }
    await originalRename(sourcePath, targetPath);
  });

  try {
    const nextLibraryHome = path.join(tempRoot, 'LibraryGuardedMove');
    await expect(updateLibraryPathSetting({ location: 'library_home', path: nextLibraryHome })).resolves.toMatchObject({
      data_dir: path.join(nextLibraryHome, 'Data'),
      library_home: nextLibraryHome
    });

    expect(blockedMainOpen).toBe(true);
    expect(blockedExternalOpen).toBe(true);
    expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) FROM nodes').pluck().get()).toBe(0);
  } finally {
    renameSpy.mockRestore();
  }
});

it('allows vanished SQLite sidecar files while copying Library Home data', async () => {
  const initialPaths = await loadLibraryPathSettings();
  initializeDatabase();
  resetSeededWorkspace();
  await fs.writeFile(path.join(initialPaths.data_dir, 'transient.db-shm'), 'sidecar');
  const originalRename = fs.rename.bind(fs);
  const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (sourcePath, targetPath) => {
    if (sourcePath === initialPaths.data_dir) {
      const error = new Error('access denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      throw error;
    }
    if (path.basename(String(sourcePath)).endsWith('-shm')) {
      await fs.unlink(sourcePath);
      const error = new Error('gone') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    await originalRename(sourcePath, targetPath);
  });

  try {
    const nextLibraryHome = path.join(tempRoot, 'LibraryVanishedSidecar');
    await expect(updateLibraryPathSetting({ location: 'library_home', path: nextLibraryHome })).resolves.toMatchObject({
      data_dir: path.join(nextLibraryHome, 'Data'),
      library_home: nextLibraryHome
    });
    expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) FROM nodes').pluck().get()).toBe(0);
  } finally {
    renameSpy.mockRestore();
  }
});

it('does not ignore a vanished primary database while copying Library Home data', async () => {
  const initialPaths = await loadLibraryPathSettings();
  initializeDatabase();
  resetSeededWorkspace();
  const originalRename = fs.rename.bind(fs);
  const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (sourcePath, targetPath) => {
    if (sourcePath === initialPaths.data_dir) {
      const error = new Error('access denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      throw error;
    }
    if (path.basename(String(sourcePath)) === 'foliole.db') {
      await fs.unlink(sourcePath);
      const error = new Error('gone') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    await originalRename(sourcePath, targetPath);
  });

  try {
    const nextLibraryHome = path.join(tempRoot, 'LibraryVanishedPrimary');
    await expect(updateLibraryPathSetting({ location: 'library_home', path: nextLibraryHome })).rejects.toMatchObject({
      code: 'ENOENT'
    });
  } finally {
    renameSpy.mockRestore();
  }
});
