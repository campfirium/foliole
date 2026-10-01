// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '/tmp/foliole-search-alias-test';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_config_dir: path.join(appData, 'config')
}) }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  Notification: class { static isSupported() { return false; } }
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { ensureSearchAliasFile, getEffectiveSearchAliases, reconcileSearchAliasMirror, startSearchAliasMirror } from './searchAliasMirror.js';
import { legacySearchAliasFilePath, searchAliasFilePath } from './searchAliasMirrorFiles.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

let root = '';
let filePath = '';
const content = () => (loadJsonSetting('search_aliases_document') as { text: string } | null)?.text ?? null;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-search-alias-'));
  appData = path.join(root, 'app');
  initializeDatabase();
  filePath = searchAliasFilePath(openDatabaseConnection().dbPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('creates a multilingual example without saving an untouched template', async () => {
  await ensureSearchAliasFile();
  expect(filePath).toBe(path.join(appData, 'Foliole', 'Widgets', 'search-aliases.txt'));
  expect(await fs.readFile(filePath, 'utf8')).toContain(
    '# Hello | Hallo | Hola | Bonjour | Ciao | こんにちは | 안녕하세요 | Cześć | Olá | Привет | 你好\n'
  );
  await reconcileSearchAliasMirror();
  expect(content()).toBeNull();
});

it('moves the previous Data file into Widgets without dropping its text', async () => {
  const legacyPath = legacySearchAliasFilePath(openDatabaseConnection().dbPath);
  await fs.rmdir(path.dirname(filePath));
  await fs.writeFile(legacyPath, 'Atlas | Mapbook\n');
  await reconcileSearchAliasMirror();
  expect(await fs.readFile(filePath, 'utf8')).toBe('Atlas | Mapbook\n');
  expect(content()).toBe('Atlas | Mapbook\n');
  await expect(fs.stat(legacyPath)).rejects.toMatchObject({ code: 'ENOENT' });
  const backup = (await fs.readdir(path.dirname(legacyPath)))
    .find((name) => name.startsWith('search-aliases.txt.migrated-'));
  expect(await fs.readFile(path.join(path.dirname(legacyPath), backup!), 'utf8')).toBe('Atlas | Mapbook\n');
});

it('keeps different files in both locations when a location conflict exists', async () => {
  const legacyPath = legacySearchAliasFilePath(openDatabaseConnection().dbPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(legacyPath, 'Atlas | Mapbook\n');
  await fs.writeFile(filePath, 'Hello | Hallo\n');
  await expect(reconcileSearchAliasMirror()).rejects.toThrow('both Data and Widgets');
  expect(await fs.readFile(legacyPath, 'utf8')).toBe('Atlas | Mapbook\n');
  expect(await fs.readFile(filePath, 'utf8')).toBe('Hello | Hallo\n');
  expect(content()).toBeNull();
});

it('does not save previous untouched examples as aliases', async () => {
  for (const example of [
    'Disney | 迪士尼',
    'Incremental reading | 渐进阅读',
    'Hello | Hallo | Hola | Bonjour | Ciao | こんにちは | 안녕하세요 | Cześć | Olá | Привет | 你好 | 哈囉'
  ]) {
    await fs.writeFile(filePath, `# One group per line. Separate spellings with |.\n# ${example}\n`);
    await reconcileSearchAliasMirror();
    expect(content()).toBeNull();
  }
});

it('imports a saved document, regenerates a missing file, and syncs an explicit clear', async () => {
  await fs.writeFile(filePath, 'Disney | 迪士尼\n');
  await reconcileSearchAliasMirror();
  expect(content()).toBe('Disney | 迪士尼\n');
  await fs.rm(filePath);
  await reconcileSearchAliasMirror();
  expect(await fs.readFile(filePath, 'utf8')).toBe('Disney | 迪士尼\n');
  await fs.writeFile(filePath, '');
  await reconcileSearchAliasMirror();
  expect(content()).toBe('');
});

it('lets a valid external file restore the document after a database rollback', async () => {
  await fs.writeFile(filePath, 'Disney | 迪士尼\n');
  await reconcileSearchAliasMirror();
  saveJsonSetting('search_aliases_document', { version: 1, text: 'old | 旧\n' });
  await reconcileSearchAliasMirror('restore');
  expect(content()).toBe('Disney | 迪士尼\n');
});

it('preserves concurrent file edits before mapping the winning database setting', async () => {
  await fs.writeFile(filePath, 'base | 基础\n');
  await reconcileSearchAliasMirror();
  await fs.writeFile(filePath, 'local | 本机\n');
  saveJsonSetting('search_aliases_document', { version: 1, text: 'remote | 远端\n' });
  await reconcileSearchAliasMirror();
  expect(await fs.readFile(filePath, 'utf8')).toBe('remote | 远端\n');
  const conflict = (await fs.readdir(path.dirname(filePath))).find((name) => name.includes('.conflict-'));
  expect(conflict).toBeTruthy();
  expect(await fs.readFile(path.join(path.dirname(filePath), conflict!), 'utf8')).toBe('local | 本机\n');
});

it('keeps an invalid file editable without changing the database', async () => {
  saveJsonSetting('search_aliases_document', { version: 1, text: 'base | 基础\n' });
  await fs.writeFile(filePath, 'bad |\n');
  await expect(reconcileSearchAliasMirror()).rejects.toThrow('Line 1');
  expect(content()).toBe('base | 基础\n');
  expect(getEffectiveSearchAliases().groups).toEqual([['base', '基础']]);
  expect(await ensureSearchAliasFile()).toBe(filePath);
});

it('imports an editor save while the search palette is closed', async () => {
  await fs.rmdir(path.dirname(filePath));
  await startSearchAliasMirror();
  await fs.writeFile(filePath, 'Disney | 迪士尼\n');
  await vi.waitFor(() => expect(content()).toBe('Disney | 迪士尼\n'));
});
