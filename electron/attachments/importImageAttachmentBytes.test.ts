// @vitest-environment node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
let mockedDocumentsDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs'),
    documents_dir: mockedDocumentsDir
  })
}));

import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadNodeResourceReferences } from '../database/nodeResources.js';

import { importImageAttachmentBytes, prepareCanonicalImageAttachment } from './importImageAttachmentBytes.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-canonical-image-writer-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function hash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assetsDir() {
  return path.join(mockedDocumentsDir, 'Foliole', 'Assets');
}

it('derives one jpg key from JPEG bytes without source hints', () => {
  expect(prepareCanonicalImageAttachment(jpeg)).toEqual({
    hash: hash(jpeg),
    mimeType: 'image/jpeg',
    sizeBytes: jpeg.byteLength,
    storageKey: `${hash(jpeg)}.jpg`
  });
  expect(prepareCanonicalImageAttachment(Buffer.from('not an image'))).toBeNull();
});

it('corrects misleading source hints and persists one canonical resource', async () => {
  const contentHash = hash(jpeg);
  await expect(importImageAttachmentBytes({
    bytes: jpeg,
    errorSource: 'https://example.com/image.png',
    mimeType: 'image/png',
    originalName: 'image.png'
  })).resolves.toMatchObject({
    attachment_id: contentHash,
    hash: contentHash,
    mime_type: 'image/jpeg',
    status: 'imported',
    storage_key: `${contentHash}.jpg`
  });
  await expect(fs.readFile(path.join(assetsDir(), `${contentHash}.jpg`))).resolves.toEqual(jpeg);
  await expect(fs.access(path.join(assetsDir(), `${contentHash}.png`))).rejects.toThrow();
  expect(openDatabaseConnection().sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'attachments'").get()).toBeUndefined();
});

it('keeps database reads available during file storage and serializes the same image', async () => {
  const originalWriteFile = fs.writeFile.bind(fs);
  let markWriting!: () => void;
  let resumeWriting!: () => void;
  const writing = new Promise<void>((resolve) => { markWriting = resolve; });
  const held = new Promise<void>((resolve) => { resumeWriting = resolve; });
  const write = vi.spyOn(fs, 'writeFile').mockImplementation(async (file, data, options) => {
    markWriting();
    await held;
    return originalWriteFile(file, data, options);
  });
  const input = { bytes: jpeg, errorSource: 'image.jpeg', mimeType: 'image/jpeg', originalName: 'image.jpeg' };
  try {
    const first = importImageAttachmentBytes(input);
    await writing;
    const second = importImageAttachmentBytes(input);
    let readFinished = false;
    const read = runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver.queryOne('SELECT 1 AS ready'))
      .then(() => { readFinished = true; });
    await new Promise(setImmediate);
    expect(readFinished).toBe(true);
    resumeWriting();
    await read;
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 'imported' }),
      expect.objectContaining({ status: 'imported' })
    ]);
    expect(write).toHaveBeenCalledOnce();
  } finally {
    resumeWriting();
    write.mockRestore();
  }
});

it('leaves no file or database rows when bytes are unsupported', async () => {
  await expect(importImageAttachmentBytes({
    bytes: Buffer.from('<svg></svg>'),
    errorSource: 'image.png',
    mimeType: 'image/png',
    originalName: 'image.png'
  })).resolves.toMatchObject({ error_code: 'unsupported_format', status: 'error' });
  expect(openDatabaseConnection().sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'attachments'").get()).toBeUndefined();
  expect(openDatabaseConnection().sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'attachment_blobs'").get()).toBeUndefined();
  await expect(fs.readdir(assetsDir())).resolves.toEqual([]);
});

it('removes a newly created canonical file when database persistence fails', async () => {
  const contentHash = hash(jpeg);
  openDatabaseConnection().sqlite.exec(
    `INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('owner', 'Owner', 'now', 'now');
     CREATE TRIGGER reject_node_resource BEFORE UPDATE OF resource_references ON nodes
     BEGIN SELECT RAISE(ABORT, 'reject node resource'); END`
  );
  await expect(importImageAttachmentBytes({
    bytes: jpeg,
    nodeId: 'owner',
    errorSource: 'image.jpeg',
    mimeType: 'image/jpeg',
    originalName: 'image.jpeg'
  })).resolves.toMatchObject({ error_code: 'storage_write_failed', status: 'error' });
  await expect(fs.access(path.join(assetsDir(), `${contentHash}.jpg`))).rejects.toThrow();
  expect(openDatabaseConnection().sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'attachments'").get()).toBeUndefined();
  expect(openDatabaseConnection().sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'attachment_blobs'").get()).toBeUndefined();
});

it('stores each original name on its owner while importing without either registry', async () => {
  const db = openDatabaseConnection().sqlite;
  db.pragma('foreign_keys = OFF');
  db.exec(`
    INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('first', 'First', 'now', 'now'), ('second', 'Second', 'now', 'now');`);
  for (const nodeId of ['first', 'second']) {
    await expect(importImageAttachmentBytes({ bytes: jpeg, errorSource: nodeId, mimeType: 'image/png',
      originalName: `${nodeId}.jpeg`, nodeId })).resolves.toMatchObject({ status: 'imported' });
    expect(loadNodeResourceReferences(nodeId)).toEqual([
      { storage_key: `${hash(jpeg)}.jpg`, original_name: `${nodeId}.jpeg`, role: 'image' }
    ]);
  }
  await expect(fs.readFile(path.join(assetsDir(), `${hash(jpeg)}.jpg`))).resolves.toEqual(jpeg);
});
