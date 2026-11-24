// @vitest-environment node

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  path: '',
  state: null as DatabaseSync | null
}));
vi.mock('./database/connection.js', () => ({
  registerDatabaseConnectionCleanup: vi.fn(),
  openDatabaseConnection: () => ({
    dbPath: database.path,
    driver: { queryOne: (sql: string, [key]: [string]) => database.state!.prepare(sql).get(key) }
  })
}));
vi.mock('./database/migrate.js', () => ({ initializeDatabase: vi.fn() }));
vi.mock('./database/startupLibraryUpgrade.js', () => ({ upgradeLibraryBeforeStartup: vi.fn() }));
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({ appendMainProcessDiagnosticLog: vi.fn() }));
vi.mock('./foregroundTimeRuntime.js', () => ({ startDesktopForegroundTime: vi.fn() }));
vi.mock('./globalClipShortcut.js', () => ({ refreshGlobalClipShortcutFromSettings: vi.fn() }));
vi.mock('./guidedSampleStartupSeed.js', () => ({ seedStartupGuidedSample: vi.fn() }));
vi.mock('./ipc/boot.js', () => ({ appendBootEvent: vi.fn(async () => undefined) }));
vi.mock('./ipc/cssSnippetFiles.js', () => ({ initializeCssSnippetDirectory: vi.fn() }));
vi.mock('./ipc/libraryPaths.js', () => ({ loadLibraryPathSettingsSync: () => ({ library_home: '/unused' }) }));
vi.mock('./ipc/menu.js', () => ({ installAppMenu: vi.fn() }));
vi.mock('./ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_config_dir: '/unused' }) }));
vi.mock('./reminders/desktopReminderRuntime.js', () => ({ startDesktopReminders: vi.fn() }));
vi.mock('./sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  Notification: class { static isSupported() { return false; } }
}));

import { beginDatabaseStartup, resetDatabaseReadinessForTests, waitForDatabaseReady } from './database/databaseReadiness.js';
import { getEffectiveSearchAliases, searchAliasMirrorStatus, stopSearchAliasMirror } from './database/searchAliasMirror.js';
import { initializeRuntimeServices } from './mainRuntimeServices.js';

afterEach(() => {
  stopSearchAliasMirror();
  resetDatabaseReadinessForTests();
  vi.restoreAllMocks();
});

it('opens the library with saved synonyms when a file blocks the Widgets directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'foliole-startup-aliases-'));
  const blockedDirectory = path.join(root, 'Widgets');
  const savedSynonyms = JSON.stringify({ version: 1, text: 'Atlas | Mapbook\n' });
  try {
    await mkdir(path.join(root, 'Data'));
    await writeFile(blockedDirectory, 'existing user file');
    database.path = path.join(root, 'Data', 'library.db');
    database.state = new DatabaseSync(database.path);
    database.state.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
    database.state.prepare('INSERT INTO settings VALUES (?, ?)').run('search_aliases_document', savedSynonyms);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    beginDatabaseStartup();
    await initializeRuntimeServices();

    await expect(waitForDatabaseReady()).resolves.toBeUndefined();
    expect(getEffectiveSearchAliases().groups).toEqual([['Atlas', 'Mapbook']]);
    expect(searchAliasMirrorStatus()).toEqual({
      error: expect.stringContaining(blockedDirectory),
      path: path.join(blockedDirectory, 'search-synonyms.txt')
    });
    expect(await readFile(blockedDirectory, 'utf8')).toBe('existing user file');
    expect(database.state.prepare('SELECT value FROM settings').get()?.value).toBe(savedSynonyms);
  } finally {
    database.state?.close();
    database.state = null;
    await rm(root, { force: true, recursive: true });
  }
});
