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

import { findAttachmentBlobManifestById } from '../database/attachmentBlobs.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

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
  expect(findAttachmentBlobManifestById(contentHash)).toMatchObject({
    attachmentId: contentHash,
    contentHash,
    mimeType: 'image/jpeg',
    storageKey: `${contentHash}.jpg`
  });
});

it('leaves no file or database rows when bytes are unsupported', async () => {
  await expect(importImageAttachmentBytes({
    bytes: Buffer.from('<svg></svg>'),
    errorSource: 'image.png',
    mimeType: 'image/png',
    originalName: 'image.png'
  })).resolves.toMatchObject({ error_code: 'unsupported_format', status: 'error' });
  expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) AS count FROM attachments').get()).toEqual({ count: 0 });
  expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) AS count FROM attachment_blobs').get()).toEqual({ count: 0 });
  await expect(fs.readdir(assetsDir())).resolves.toEqual([]);
});

it('removes a newly created canonical file when database persistence fails', async () => {
  const contentHash = hash(jpeg);
  openDatabaseConnection().sqlite.exec(
    `CREATE TRIGGER reject_image_manifest BEFORE INSERT ON attachment_blobs
     BEGIN SELECT RAISE(ABORT, 'reject image manifest'); END`
  );
  await expect(importImageAttachmentBytes({
    bytes: jpeg,
    errorSource: 'image.jpeg',
    mimeType: 'image/jpeg',
    originalName: 'image.jpeg'
  })).resolves.toMatchObject({ error_code: 'storage_write_failed', status: 'error' });
  await expect(fs.access(path.join(assetsDir(), `${contentHash}.jpg`))).rejects.toThrow();
  expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) AS count FROM attachments').get()).toEqual({ count: 0 });
  expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) AS count FROM attachment_blobs').get()).toEqual({ count: 0 });
});
