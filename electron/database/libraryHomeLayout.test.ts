// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-library-home-layout-app-data';
let mockedDocumentsDir = '/tmp/foliole-library-home-layout-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { importLocalImageAttachment } from '../attachments/importLocalImageAttachment.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

import { closeDatabaseConnection, openDatabaseConnection, resolveDatabasePath } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-library-home-layout-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedNode(nodeId: string) {
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
    .run(nodeId, null, nodeId, 1, 0, '', null, null, '2026-03-30T00:00:00.000Z', '2026-03-30T00:00:00.000Z', null);
}

it('initializes and keeps using the library home directory layout across restart', async () => {
  const libraryHome = path.join(mockedDocumentsDir, 'Foliole');
  const dataDir = path.join(libraryHome, 'Data');
  const assetsDir = path.join(libraryHome, 'Assets');
  const importDir = path.join(libraryHome, 'Import');
  const inboxDir = path.join(importDir, 'Inbox');
  const mirrorDir = path.join(libraryHome, 'Mirror');

  const firstConnection = initializeDatabase();

  expect((await fs.stat(dataDir)).isDirectory()).toBe(true);
  expect((await fs.stat(assetsDir)).isDirectory()).toBe(true);
  expect((await fs.stat(importDir)).isDirectory()).toBe(true);
  expect((await fs.stat(inboxDir)).isDirectory()).toBe(true);
  expect((await fs.stat(mirrorDir)).isDirectory()).toBe(true);
  expect((await fs.stat(firstConnection.dbPath)).isFile()).toBe(true);
  expect(firstConnection.dbPath).toBe(path.join(dataDir, 'foliole.db'));

  seedNode('node-1');
  const sourcePath = path.join(tempRoot, 'cover.png');
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const hash = createHash('sha256').update(imageBytes).digest('hex');
  await fs.writeFile(sourcePath, imageBytes);

  await expect(importLocalImageAttachment('node-1', sourcePath)).resolves.toMatchObject({
    status: 'imported',
    attachment_id: hash,
    stored_file: 'created'
  });
  await expect(fs.readFile(resolveAttachmentStoragePath(hash, assetsDir, 'cover.png'))).resolves.toEqual(imageBytes);
  await expect(fs.access(path.join(assetsDir, hash))).rejects.toThrow();

  closeDatabaseConnection();

  const secondConnection = initializeDatabase();
  expect(secondConnection.dbPath).toBe(path.join(dataDir, 'foliole.db'));
  expect(resolveDatabasePath()).toBe(path.join(dataDir, 'foliole.db'));
  expect(secondConnection.sqlite.prepare('SELECT COUNT(*) FROM attachments').pluck().get()).toBe(1);
});
