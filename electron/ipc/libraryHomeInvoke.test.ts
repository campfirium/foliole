// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0', isPackaged: false },
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null },
  shell: { openPath: vi.fn() },
  nativeTheme: { shouldUseDarkColors: false, on: vi.fn() },
  systemPreferences: { subscribeNotification: vi.fn() }
}));
vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: path.join(tempRoot, 'app-data'),
    app_cache_dir: path.join(tempRoot, 'cache'),
    app_config_dir: path.join(tempRoot, 'config'),
    documents_dir: path.join(tempRoot, 'Documents'),
    app_log_dir: path.join(tempRoot, 'logs')
  })
}));
vi.mock('../mirror/rebuildAttachmentLinks.js', () => ({ rebuildMirrorAttachmentLinks: vi.fn() }));
vi.mock('../database/searchAliasMirror.js', () => ({ startSearchAliasMirror: vi.fn() }));
vi.mock('../import/managedInboxMonitor.js', () => ({ refreshManagedInboxMonitorFromSettings: vi.fn() }));

import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { desktopTaskScheduler } from '../desktopTaskScheduler.js';

import { handleInvokeRequest } from './commands.js';
import { saveCurrentLibraryHome } from './libraryPathBootstrap.js';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-library-home-invoke-'));
  saveCurrentLibraryHome(path.join(tempRoot, 'LibraryOld'));
  initializeDatabase();
  openDatabaseConnection().sqlite.exec("CREATE TABLE migration_probe(value TEXT); INSERT INTO migration_probe VALUES ('old')");
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

function updateHome(target: string, confirmed = false) {
  return handleInvokeRequest({ command: 'update_library_path_setting', args: {
    location: 'library_home', path: target, confirm_existing_library_home: confirmed
  } });
}

function readProbe() {
  return openDatabaseConnection().sqlite.prepare('SELECT value FROM migration_probe').pluck().get();
}

it('moves an open library through the normal IPC entry and persists its selection', async () => {
  const target = path.join(tempRoot, 'LibraryNext');
  await expect(handleInvokeRequest({ command: 'update_library_path_setting', args: {
    location: 'library_home', path: target
  } })).resolves.toMatchObject({ library_home: target });
  expect(openDatabaseConnection().sqlite.prepare('SELECT value FROM migration_probe').pluck().get()).toBe('old');
  expect(openDatabaseConnection().dbPath).toBe(path.join(target, 'Data', 'foliole.db'));
  const pointer = JSON.parse(await fs.readFile(path.join(tempRoot, 'config', 'current-library.json'), 'utf8'));
  expect(pointer.library_home).toBe(target);
  await expect(fs.access(path.join(tempRoot, 'LibraryOld', 'Data', 'foliole.db'))).rejects.toThrow();
});

it('drains a library task whose abort cleanup needs the database owner', async () => {
  let started = () => {};
  const running = new Promise<void>((resolve) => { started = resolve; });
  const task = desktopTaskScheduler.submit({
    id: 'migration-abort-cleanup', concurrencyKey: 'migration-abort-cleanup', label: 'Migration probe',
    source: 'test', priority: 'background', resources: [{ resource: 'library' }],
    run: async ({ signal }) => {
      started();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      await runWithDatabaseConnectionOwner(() => {
        openDatabaseConnection().sqlite.prepare("UPDATE migration_probe SET value = 'drained'").run();
      });
    }
  });
  await running;
  await updateHome(path.join(tempRoot, 'LibraryNext'));
  await task.promise;
  expect(readProbe()).toBe('drained');
});

it('queues other IPC reads until the new library pointer is saved', async () => {
  const target = path.join(tempRoot, 'LibraryNext');
  const rename = fs.rename.bind(fs);
  let reachedMove = () => {};
  const moving = new Promise<void>((resolve) => { reachedMove = resolve; });
  let releaseMove = () => {};
  const released = new Promise<void>((resolve) => { releaseMove = resolve; });
  vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
    if (destination === path.join(target, 'Data')) {
      reachedMove();
      await released;
    }
    return rename(source, destination);
  });
  const migration = updateHome(target);
  await moving;
  const read = handleInvokeRequest({ command: 'load_library_path_settings', args: {} });
  releaseMove();
  await migration;
  await expect(read).resolves.toMatchObject({ library_home: target });
  expect(readProbe()).toBe('old');
});

it('keeps non-home path updates coordinated and persistent', async () => {
  const mirror = path.join(tempRoot, 'CustomMirror');
  await handleInvokeRequest({ command: 'update_library_path_setting', args: { location: 'mirror', path: mirror } });
  closeDatabaseConnection();
  await expect(handleInvokeRequest({ command: 'load_library_path_settings', args: {} }))
    .resolves.toMatchObject({ mirror, library_home: path.join(tempRoot, 'LibraryOld') });
  expect(readProbe()).toBe('old');
});

it('keeps library tasks paused until overlapping home changes finish', async () => {
  const first = path.join(tempRoot, 'First');
  const second = path.join(tempRoot, 'Second');
  const rename = fs.rename.bind(fs);
  let firstMove = () => {};
  const firstMoving = new Promise<void>((resolve) => { firstMove = resolve; });
  let releaseFirst = () => {};
  const firstReleased = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let secondMove = () => {};
  const secondMoving = new Promise<void>((resolve) => { secondMove = resolve; });
  let releaseSecond = () => {};
  const secondReleased = new Promise<void>((resolve) => { releaseSecond = resolve; });
  vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
    if (destination === path.join(first, 'Data')) {
      firstMove();
      await firstReleased;
    }
    if (destination === path.join(second, 'Data')) {
      secondMove();
      await secondReleased;
    }
    return rename(source, destination);
  });
  const a = updateHome(first);
  await firstMoving;
  const b = updateHome(second);
  releaseFirst();
  await a;
  await secondMoving;
  let ran = false;
  const task = desktopTaskScheduler.submit({
    id: 'overlapping-migration', concurrencyKey: 'overlapping-migration', label: 'Overlapping migration',
    source: 'test', priority: 'background', resources: [{ resource: 'library' }],
    run: () => {
      ran = true;
      return runWithDatabaseConnectionOwner(readProbe);
    }
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ran).toBe(false);
  } finally {
    releaseSecond();
    await b;
    await expect(task.promise).resolves.toBe('old');
  }
  expect(openDatabaseConnection().dbPath).toBe(path.join(second, 'Data', 'foliole.db'));
});

it('requires confirmation to adopt an existing library and keeps the original library', async () => {
  const old = path.join(tempRoot, 'LibraryOld');
  const target = path.join(tempRoot, 'Existing');
  closeDatabaseConnection();
  saveCurrentLibraryHome(target);
  initializeDatabase();
  openDatabaseConnection().sqlite.exec("CREATE TABLE migration_probe(value TEXT); INSERT INTO migration_probe VALUES ('existing')");
  closeDatabaseConnection();
  saveCurrentLibraryHome(old);
  expect(readProbe()).toBe('old');
  await expect(updateHome(target)).rejects.toThrow('existing_library_home_requires_confirmation');
  expect(readProbe()).toBe('old');
  await updateHome(target, true);
  expect(readProbe()).toBe('existing');
  await fs.access(path.join(old, 'Data', 'foliole.db'));
});

it('releases the owner and resumes tasks after a filesystem failure before moving data', async () => {
  const target = path.join(tempRoot, 'Blocked');
  await fs.writeFile(target, 'blocking file');
  await expect(updateHome(target)).rejects.toThrow();
  expect(readProbe()).toBe('old');
  const task = desktopTaskScheduler.submit({
    id: 'migration-resumed', concurrencyKey: 'migration-resumed', label: 'Migration resumed',
    source: 'test', priority: 'background', resources: [{ resource: 'library' }],
    run: () => runWithDatabaseConnectionOwner(readProbe)
  });
  await expect(task.promise).resolves.toBe('old');
  await fs.unlink(target);
  await updateHome(target);
  expect(readProbe()).toBe('old');
});

it('protects the moved database after a later attachment conflict', async () => {
  const old = path.join(tempRoot, 'LibraryOld');
  const target = path.join(tempRoot, 'LibraryNext');
  await fs.writeFile(path.join(old, 'Assets', 'probe.txt'), 'original');
  await fs.mkdir(path.join(target, 'Assets'), { recursive: true });
  await fs.writeFile(path.join(target, 'Assets', 'probe.txt'), 'conflict');
  await expect(updateHome(target)).rejects.toThrow('library path move conflict');
  expect(() => openDatabaseConnection()).toThrow('library_home_database_moved');
  await expect(fs.access(path.join(old, 'Data', 'foliole.db'))).rejects.toThrow();
  const pointer = JSON.parse(await fs.readFile(path.join(tempRoot, 'config', 'current-library.json'), 'utf8'));
  expect(pointer.library_home).toBe(old);
  saveCurrentLibraryHome(target);
  expect(readProbe()).toBe('old');
});
