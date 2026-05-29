// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-keep-import-source-handling-tests';
const { notifyManagedInboxUpdated } = vi.hoisted(() => ({
  notifyManagedInboxUpdated: vi.fn()
}));
const { trashItem } = vi.hoisted(() => ({
  trashItem: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated
}));
vi.mock('electron', () => ({
  shell: { trashItem }
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { runKeepImportRule } from './keepImportService.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-keep-import-source-handling-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  trashItem.mockImplementation(async (filePath: string) => {
    const trashPath = path.join(tempRoot, 'mock-trash', `${trashItem.mock.calls.length}-${path.basename(filePath)}`);
    await fs.mkdir(path.dirname(trashPath), { recursive: true });
    await fs.rename(filePath, trashPath);
  });
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  notifyManagedInboxUpdated.mockReset();
  trashItem.mockReset();
});

it('deletes primary and split highlight files after a successful delete-handling import', async () => {
  const sourceDir = path.join(tempRoot, 'originals');
  const highlightDir = path.join(tempRoot, 'highlights');
  const sourceFile = path.join(sourceDir, 'entry.md');
  const highlightFile = path.join(highlightDir, 'entry.md');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(sourceFile, 'Before matching highlight after.', 'utf8');
  await fs.writeFile(highlightFile, '- matching highlight', 'utf8');

  await runKeepImportRule({
    actionMode: 'delete',
    directoryPath: sourceDir,
    highlightDirectoryPath: highlightDir,
    highlightMode: 'split',
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-401',
    sourceType: 'generic'
  });

  const row = openDatabaseConnection().sqlite
    .prepare(`SELECT content FROM nodes WHERE title = 'entry' ORDER BY created_at DESC LIMIT 1`)
    .get() as { content: string };

  await expect(fs.stat(sourceFile)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.stat(highlightFile)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.stat(path.join(tempRoot, 'mock-trash', '1-entry.md'))).resolves.toBeTruthy();
  await expect(fs.stat(path.join(tempRoot, 'mock-trash', '2-entry.md'))).resolves.toBeTruthy();
  expect(trashItem).toHaveBeenCalledWith(sourceFile);
  expect(trashItem).toHaveBeenCalledWith(highlightFile);
  expect(row.content).toContain('Before matching highlight after.');
});

it('deletes leftover unchanged files when delete handling is enabled after import', async () => {
  const sourceDir = path.join(tempRoot, 'unchanged-originals');
  const highlightDir = path.join(tempRoot, 'unchanged-highlights');
  const sourceFile = path.join(sourceDir, 'entry.md');
  const highlightFile = path.join(highlightDir, 'entry.md');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(sourceFile, 'Before matching highlight after.', 'utf8');
  await fs.writeFile(highlightFile, '- matching highlight', 'utf8');

  await runKeepImportRule({
    actionMode: 'keep',
    directoryPath: sourceDir,
    highlightDirectoryPath: highlightDir,
    highlightMode: 'split',
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-402',
    sourceType: 'generic'
  });

  await runKeepImportRule({
    actionMode: 'delete',
    directoryPath: sourceDir,
    highlightDirectoryPath: highlightDir,
    highlightMode: 'split',
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-402',
    sourceType: 'generic'
  });

  await expect(fs.stat(sourceFile)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.stat(highlightFile)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(trashItem).toHaveBeenCalledWith(sourceFile);
  expect(trashItem).toHaveBeenCalledWith(highlightFile);
});
