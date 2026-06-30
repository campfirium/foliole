// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-library-path-migration-app-data';
let mockedDocumentsDir = '/tmp/foliole-library-path-migration-documents';

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

import { openDatabaseConnection, resolveDatabasePath } from '../database/connection.js';
import { resetSeededWorkspace } from '../database/databaseTestWorkspace.js';
import { initializeDatabase } from '../database/migrate.js';

import { loadLibraryPathSettings, updateLibraryPathSetting } from './libraryPaths.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-library-path-migration-'));
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

it('moves existing assets into the new assets folder', async () => {
  const initialPaths = await loadLibraryPathSettings();
  const sourceFile = path.join(initialPaths.assets_dir, 'hash-1.png');
  await fs.mkdir(initialPaths.assets_dir, { recursive: true });
  await fs.writeFile(sourceFile, 'image-bytes');

  const nextAssetsDir = path.join(tempRoot, 'AttachmentVault');
  await expect(updateLibraryPathSetting({ location: 'assets_dir', path: nextAssetsDir })).resolves.toMatchObject({
    assets_dir: nextAssetsDir
  });

  await expect(fs.readFile(path.join(nextAssetsDir, 'hash-1.png'), 'utf8')).resolves.toBe('image-bytes');
  await expect(fs.access(sourceFile)).rejects.toThrow();
});

it('moves existing inbox and mirror content into their new folders', async () => {
  const initialPaths = await loadLibraryPathSettings();
  await fs.mkdir(initialPaths.inbox, { recursive: true });
  await fs.mkdir(initialPaths.mirror, { recursive: true });
  await fs.writeFile(path.join(initialPaths.inbox, 'draft.md'), '# inbox');
  await fs.writeFile(path.join(initialPaths.mirror, 'entry.md'), '# mirror');

  const nextInbox = path.join(tempRoot, 'Capture');
  const nextMirror = path.join(tempRoot, 'MarkdownMirror');
  await updateLibraryPathSetting({ location: 'inbox', path: nextInbox });
  await updateLibraryPathSetting({ location: 'mirror', path: nextMirror });

  await expect(fs.readFile(path.join(nextInbox, 'draft.md'), 'utf8')).resolves.toBe('# inbox');
  await expect(fs.readFile(path.join(nextMirror, 'entry.md'), 'utf8')).resolves.toBe('# mirror');
});

it('merges content into an existing target folder instead of renaming over it', async () => {
  const initialPaths = await loadLibraryPathSettings();
  await fs.mkdir(initialPaths.mirror, { recursive: true });
  await fs.writeFile(path.join(initialPaths.mirror, 'entry.md'), '# moved');

  const existingMirrorDir = path.join(tempRoot, 'ExistingMirror');
  await fs.mkdir(existingMirrorDir, { recursive: true });
  await fs.writeFile(path.join(existingMirrorDir, 'keep.md'), '# keep');

  await expect(updateLibraryPathSetting({ location: 'mirror', path: existingMirrorDir })).resolves.toMatchObject({
    mirror: existingMirrorDir
  });

  await expect(fs.readFile(path.join(existingMirrorDir, 'entry.md'), 'utf8')).resolves.toBe('# moved');
  await expect(fs.readFile(path.join(existingMirrorDir, 'keep.md'), 'utf8')).resolves.toBe('# keep');
});

it('moves data and default library folders when library home changes', async () => {
  const initialPaths = await loadLibraryPathSettings();
  initializeDatabase();
  resetSeededWorkspace();
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (
         id,
         parent_id,
         title,
         is_title_manual,
         hide_title_heading,
         content,
         reveal,
         anchor_link,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('node-1', null, 'Node 1', 1, 0, '', null, null, '2026-03-30T00:00:00.000Z', '2026-03-30T00:00:00.000Z', null);
  await fs.writeFile(path.join(initialPaths.assets_dir, 'hash-1.png'), 'asset');
  await fs.writeFile(path.join(initialPaths.inbox, 'draft.md'), '# draft');
  await fs.writeFile(path.join(initialPaths.mirror, 'entry.md'), '# entry');

  const nextLibraryHome = path.join(tempRoot, 'LibraryNext');
  await expect(updateLibraryPathSetting({ location: 'library_home', path: nextLibraryHome })).resolves.toMatchObject({
    library_home: nextLibraryHome,
    data_dir: path.join(nextLibraryHome, 'Data'),
    assets_dir: path.join(nextLibraryHome, 'Assets'),
    inbox: path.join(nextLibraryHome, 'Inbox'),
    mirror: path.join(nextLibraryHome, 'Mirror')
  });

  expect(resolveDatabasePath()).toBe(path.join(nextLibraryHome, 'Data', 'foliole.db'));
  expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) FROM nodes').pluck().get()).toBe(1);
  await expect(fs.readFile(path.join(nextLibraryHome, 'Assets', 'hash-1.png'), 'utf8')).resolves.toBe('asset');
  await expect(fs.readFile(path.join(nextLibraryHome, 'Inbox', 'draft.md'), 'utf8')).resolves.toBe('# draft');
  await expect(fs.readFile(path.join(nextLibraryHome, 'Mirror', 'entry.md'), 'utf8')).resolves.toBe('# entry');
});

it('falls back to copying data when Windows denies directory rename', async () => {
  const initialPaths = await loadLibraryPathSettings();
  initializeDatabase();
  resetSeededWorkspace();
  await fs.writeFile(path.join(initialPaths.data_dir, 'fallback-marker.txt'), 'copied');
  const originalRename = fs.rename.bind(fs);
  const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (sourcePath, targetPath) => {
    if (sourcePath === initialPaths.data_dir) {
      const error = new Error('access denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      throw error;
    }
    await originalRename(sourcePath, targetPath);
  });

  try {
    const nextLibraryHome = path.join(tempRoot, 'LibraryDeniedRename');
    await expect(updateLibraryPathSetting({ location: 'library_home', path: nextLibraryHome })).resolves.toMatchObject({
      data_dir: path.join(nextLibraryHome, 'Data'),
      library_home: nextLibraryHome
    });

    expect(renameSpy).toHaveBeenCalled();
    expect(resolveDatabasePath()).toBe(path.join(nextLibraryHome, 'Data', 'foliole.db'));
    expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) FROM nodes').pluck().get()).toBe(0);
    await expect(fs.readFile(path.join(nextLibraryHome, 'Data', 'fallback-marker.txt'), 'utf8')).resolves.toBe('copied');
    await expect(fs.access(initialPaths.data_dir)).rejects.toThrow();
  } finally {
    renameSpy.mockRestore();
  }
});

it('requires confirmation before adopting an existing library home', async () => {
  const initialPaths = await loadLibraryPathSettings();
  initializeDatabase();
  resetSeededWorkspace();
  await fs.writeFile(path.join(initialPaths.assets_dir, 'debug-asset.png'), 'debug asset');

  const existingLibraryHome = path.join(tempRoot, 'ExistingLibrary');
  const existingDatabasePath = path.join(existingLibraryHome, 'Data', 'foliole.db');
  await fs.mkdir(path.dirname(existingDatabasePath), { recursive: true });
  await fs.writeFile(existingDatabasePath, 'existing library db');

  await expect(updateLibraryPathSetting({ location: 'library_home', path: existingLibraryHome })).rejects.toThrow(
    'existing_library_home_requires_confirmation'
  );
  await expect(
    updateLibraryPathSetting({
      confirm_existing_library_home: false,
      location: 'library_home',
      path: existingLibraryHome
    })
  ).rejects.toThrow('existing_library_home_requires_confirmation');

  await expect(
    updateLibraryPathSetting({
      confirm_existing_library_home: true,
      location: 'library_home',
      path: existingLibraryHome
    })
  ).resolves.toMatchObject({ database_path: existingDatabasePath, library_home: existingLibraryHome });

  expect(resolveDatabasePath()).toBe(existingDatabasePath);
  await expect(fs.readFile(existingDatabasePath, 'utf8')).resolves.toBe('existing library db');
  await expect(fs.access(path.join(initialPaths.data_dir, 'foliole.db'))).resolves.toBeUndefined();
  await expect(fs.readFile(path.join(initialPaths.assets_dir, 'debug-asset.png'), 'utf8')).resolves.toBe('debug asset');
});

it('keeps independently configured child folders in place when library home changes', async () => {
  const initialPaths = await loadLibraryPathSettings();
  initializeDatabase();
  resetSeededWorkspace();
  await fs.writeFile(path.join(initialPaths.assets_dir, 'default-asset.png'), 'default asset');

  const customAssetsDir = path.join(tempRoot, 'AttachmentVault');
  const customInboxDir = path.join(tempRoot, 'Capture');
  const customMirrorDir = path.join(tempRoot, 'MirrorVault');
  await updateLibraryPathSetting({ location: 'assets_dir', path: customAssetsDir });
  await updateLibraryPathSetting({ location: 'inbox', path: customInboxDir });
  await updateLibraryPathSetting({ location: 'mirror', path: customMirrorDir });

  await fs.writeFile(path.join(customAssetsDir, 'custom-asset.png'), 'custom asset');
  await fs.writeFile(path.join(customInboxDir, 'custom-inbox.md'), '# custom inbox');
  await fs.writeFile(path.join(customMirrorDir, 'custom-entry.md'), '# custom mirror');

  const nextLibraryHome = path.join(tempRoot, 'LibraryNext');
  await expect(updateLibraryPathSetting({ location: 'library_home', path: nextLibraryHome })).resolves.toMatchObject({
    library_home: nextLibraryHome,
    assets_dir: customAssetsDir,
    inbox: customInboxDir,
    mirror: customMirrorDir
  });

  expect(resolveDatabasePath()).toBe(path.join(nextLibraryHome, 'Data', 'foliole.db'));
  await expect(fs.readFile(path.join(customAssetsDir, 'custom-asset.png'), 'utf8')).resolves.toBe('custom asset');
  await expect(fs.readFile(path.join(customInboxDir, 'custom-inbox.md'), 'utf8')).resolves.toBe('# custom inbox');
  await expect(fs.readFile(path.join(customMirrorDir, 'custom-entry.md'), 'utf8')).resolves.toBe('# custom mirror');
  await expect(fs.access(path.join(nextLibraryHome, 'Assets', 'custom-asset.png'))).rejects.toThrow();
  await expect(fs.access(path.join(nextLibraryHome, 'Inbox', 'custom-inbox.md'))).rejects.toThrow();
  await expect(fs.access(path.join(nextLibraryHome, 'Mirror', 'custom-entry.md'))).rejects.toThrow();
});

it('rejects moving a folder into its own child folder', async () => {
  const initialPaths = await loadLibraryPathSettings();

  await expect(
    updateLibraryPathSetting({
      location: 'assets_dir',
      path: path.join(initialPaths.assets_dir, 'NestedTarget')
    })
  ).rejects.toThrow('Target Assets folder cannot be inside the current Assets folder.');

  await expect(
    updateLibraryPathSetting({
      location: 'mirror',
      path: path.join(initialPaths.mirror, 'NestedTarget')
    })
  ).rejects.toThrow('Target Mirror folder cannot be inside the current Mirror folder.');
});
