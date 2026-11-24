// @vitest-environment node

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, expect, it, vi } from 'vitest';

import type { DatabaseBindParams, DatabaseDriver, DatabaseRow } from '../lib/core/database/driver.js';
import { SYNC_SCHEMA_STATEMENTS } from '../lib/core/database/syncSchemaStatements.js';

const database = vi.hoisted(() => ({
  path: '',
  configPath: '',
  state: null as DatabaseSync | null
}));
vi.mock('./database/connection.js', () => ({
  registerDatabaseConnectionCleanup: vi.fn(),
  openDatabaseConnection: () => ({ dbPath: database.path, driver: sqliteDriver }),
  runWithDatabaseConnectionOwner: (run: () => Promise<void>) => run()
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
vi.mock('./ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_config_dir: database.configPath }) }));
vi.mock('./reminders/desktopReminderRuntime.js', () => ({ startDesktopReminders: vi.fn() }));
vi.mock('./sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  Notification: class { static isSupported() { return false; } }
}));

import { beginDatabaseStartup, resetDatabaseReadinessForTests, waitForDatabaseReady } from './database/databaseReadiness.js';
import {
  ensureSearchAliasFile,
  getEffectiveSearchAliases,
  reconcileSearchAliasMirror,
  searchAliasMirrorStatus,
  stopSearchAliasMirror
} from './database/searchAliasMirror.js';
import { initializeRuntimeServices } from './mainRuntimeServices.js';

const sqliteDriver = {
  queryOne<T extends DatabaseRow>(sql: string, params: DatabaseBindParams = []) {
    return database.state!.prepare(sql).get(...params) as T | undefined;
  },
  execute(sql: string, params: DatabaseBindParams = []) {
    const result = database.state!.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowId: result.lastInsertRowid };
  },
  transaction<T>(run: (driver: DatabaseDriver) => T) {
    const sqlite = database.state!;
    sqlite.exec('BEGIN');
    try {
      const result = run(sqliteDriver as DatabaseDriver);
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }
};

let root = '';
const savedSynonyms = JSON.stringify({ version: 1, text: 'Atlas | Mapbook\n' });

async function initializeWithBlockedWidgetsDirectory() {
  root = await mkdtemp(path.join(tmpdir(), 'foliole-startup-aliases-'));
  const blockedDirectory = path.join(root, 'Widgets');
  await mkdir(path.join(root, 'Data'));
  await writeFile(blockedDirectory, 'existing user file');
  database.path = path.join(root, 'Data', 'library.db');
  database.configPath = path.join(root, 'config');
  database.state = new DatabaseSync(database.path);
  database.state.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
  database.state.exec(SYNC_SCHEMA_STATEMENTS.join(';\n'));
  const insert = database.state.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  insert.run('host_name', 'desktop-fixture');
  insert.run('search_aliases_document', savedSynonyms);
  vi.spyOn(console, 'error').mockImplementation(() => {});

  beginDatabaseStartup();
  await initializeRuntimeServices();
  return blockedDirectory;
}

function readSavedSynonyms() {
  return database.state!.prepare("SELECT value FROM settings WHERE key = 'search_aliases_document'").get()?.value;
}

afterEach(async () => {
  stopSearchAliasMirror();
  resetDatabaseReadinessForTests();
  vi.restoreAllMocks();
  database.state?.close();
  database.state = null;
  await rm(root, { force: true, recursive: true });
});

it('opens the library with saved synonyms when a file blocks the Widgets directory', async () => {
  const blockedDirectory = await initializeWithBlockedWidgetsDirectory();

  await expect(waitForDatabaseReady()).resolves.toBeUndefined();
  expect(getEffectiveSearchAliases().groups).toEqual([['Atlas', 'Mapbook']]);
  expect(searchAliasMirrorStatus()).toEqual({
    error: expect.stringContaining(blockedDirectory),
    path: path.join(blockedDirectory, 'search-synonyms.txt')
  });
  expect(await readFile(blockedDirectory, 'utf8')).toBe('existing user file');
  expect(readSavedSynonyms()).toBe(savedSynonyms);
});

it('keeps the watcher failure visible until opening the repaired file resumes imports', async () => {
  const blockedDirectory = await initializeWithBlockedWidgetsDirectory();
  await waitForDatabaseReady();
  await rm(blockedDirectory);
  await reconcileSearchAliasMirror();
  expect(searchAliasMirrorStatus().error).toContain(blockedDirectory);

  const filePath = await ensureSearchAliasFile();
  expect(searchAliasMirrorStatus()).toEqual({ error: null, path: filePath });
  vi.mocked(console.error).mockRestore();
  await writeFile(filePath, 'Atlas | Chartbook\n');
  await vi.waitFor(() => {
    expect(readSavedSynonyms()).toBe(JSON.stringify({ version: 1, text: 'Atlas | Chartbook\n' }));
    expect(getEffectiveSearchAliases().groups).toEqual([['Atlas', 'Chartbook']]);
  }, { timeout: 3000 });
});
