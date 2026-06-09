// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-local-file-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { listLocalFiles, readLocalFile, saveLocalFile } from './localFiles.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-local-files-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('reads recent local file metadata without storing a content mirror', async () => {
  const filePath = path.join(tempRoot, 'note.md');
  await fs.writeFile(filePath, '![Cover](images/cover.png)', 'utf8');

  const result = await readLocalFile(filePath);

  expect(result).toMatchObject({ absolutePath: filePath, content: '![Cover](images/cover.png)', status: 'ready', title: 'note.md' });
  expect(listLocalFiles()[0]).toMatchObject({ absolutePath: filePath, title: 'note.md' });
  expect(openDatabaseConnection().sqlite.prepare('PRAGMA table_info(local_files)').all())
    .not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'content' })]));
});

it('saves through mtime and size guards so external edits become conflicts', async () => {
  const filePath = path.join(tempRoot, 'guarded.md');
  await fs.writeFile(filePath, 'original', 'utf8');
  const opened = await readLocalFile(filePath);
  expect(opened.status).toBe('ready');

  await fs.writeFile(filePath, 'external change', 'utf8');
  await expect(saveLocalFile({
    content: 'my change',
    expectedFileSize: opened.status === 'ready' ? opened.fileSize : null,
    expectedModifiedAt: opened.status === 'ready' ? opened.modifiedAt : null,
    path: filePath
  })).resolves.toMatchObject({ status: 'conflict' });

  await expect(saveLocalFile({ content: 'my change', force: true, path: filePath })).resolves.toMatchObject({ status: 'saved' });
  await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('my change');
});
