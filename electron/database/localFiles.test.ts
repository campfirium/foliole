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
import { searchExternalDocuments } from './externalSearchCache.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { listLocalFiles, readLocalFile, saveLocalFile } from './localFiles.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-local-files-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
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

it('indexes opened local documents without storing content in local_files', async () => {
  const filePath = path.join(tempRoot, 'searchable.md');
  await fs.writeFile(filePath, '# Local\nSearchable local-only marker', 'utf8');

  await readLocalFile(filePath);

  expect(searchExternalDocuments('local-only')).toEqual([
    expect.objectContaining({
      externalMatch: expect.objectContaining({ absolutePath: filePath }),
      title: 'searchable.md'
    })
  ]);
});

it('updates the local document search index after save', async () => {
  const filePath = path.join(tempRoot, 'indexed.md');
  await fs.writeFile(filePath, '# Local\nOld searchable marker', 'utf8');
  const opened = await readLocalFile(filePath);
  expect(opened.status).toBe('ready');

  await saveLocalFile({
    content: '# Local\nNew searchable marker',
    expectedFileSize: opened.status === 'ready' ? opened.fileSize : null,
    expectedModifiedAt: opened.status === 'ready' ? opened.modifiedAt : null,
    path: filePath
  });

  expect(searchExternalDocuments('new searchable')).toEqual([
    expect.objectContaining({ externalMatch: expect.objectContaining({ absolutePath: filePath }) })
  ]);
  expect(searchExternalDocuments('old searchable')).toEqual([]);
});

it('finds local documents by combining split Chinese search terms', async () => {
  const filePath = path.join(tempRoot, 'combined-cjk.md');
  const partialPath = path.join(tempRoot, 'partial-cjk.md');
  await fs.writeFile(filePath, '哈哈哈哈一二三', 'utf8');
  await fs.writeFile(partialPath, '哈哈哈哈但是没有后半段', 'utf8');

  await readLocalFile(filePath);
  await readLocalFile(partialPath);

  const resultIds = searchExternalDocuments('哈哈哈哈 一二三').map((result) => result.id);
  expect(resultIds).toContain(filePath);
  expect(resultIds).not.toContain(partialPath);
});
