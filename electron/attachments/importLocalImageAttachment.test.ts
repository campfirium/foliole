// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-image-attachment-import-tests';
let mockedDocumentsDir = '/tmp/foliole-image-attachment-import-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { findAttachmentBlobManifestById } from '../database/attachmentBlobs.js';
import { listAttachmentNodeLinks, listNodeAttachments } from '../database/attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { importLocalImageAttachment } from './importLocalImageAttachment.js';
import { resolveAttachmentStoragePath } from './resourceResolver.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-image-attachment-import-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
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
    .run(nodeId, null, nodeId, 1, 0, '', null, null, '2026-03-29T00:00:00.000Z', '2026-03-29T00:00:00.000Z', null);
}

function countAttachments() {
  const row = openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) AS count FROM attachments').get() as { count: number };
  return row.count;
}

function hashBytes(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function createPngBytes() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01
  ]);
}

function expectAttachmentSyncState(attachmentId: string, sizeBytes: number) {
  expect(openDatabaseConnection().driver.queryOne<{ content_hash: string; object_type: string; sync_dirty: number }>(
    `SELECT content_hash, object_type, sync_dirty FROM sync_object_state WHERE object_type = 'attachment' AND object_id = ?`,
    [attachmentId]
  )).toEqual({ content_hash: expect.any(String), object_type: 'attachment', sync_dirty: 1 });
  expect(findAttachmentBlobManifestById(attachmentId)).toEqual(expect.objectContaining({
    attachmentId,
    availability: 'local',
    contentHash: attachmentId,
    sizeBytes,
    storageKey: `${attachmentId}.png`
  }));
}

it('imports a local png into the app attachment directory and links it to the node', async () => {
  seedNode('node-1');
  const sourcePath = path.join(tempRoot, 'cover.png');
  const imageBytes = createPngBytes();

  await fs.writeFile(sourcePath, imageBytes);

  await expect(importLocalImageAttachment('node-1', sourcePath)).resolves.toEqual({
    status: 'imported',
    attachment_id: hashBytes(imageBytes),
    attachment_record: 'created',
    created_at: expect.any(String),
    hash: hashBytes(imageBytes),
    intrinsic_size: { height: 1, width: 1 },
    mime_type: 'image/png',
    original_name: 'cover.png',
    size_bytes: imageBytes.byteLength,
    stored_file: 'created'
  });

  const [nodeAttachment] = listNodeAttachments('node-1');
  expect(nodeAttachment).toEqual({
    nodeId: 'node-1',
    attachmentId: hashBytes(imageBytes),
    role: 'image',
    attachment: {
      id: hashBytes(imageBytes),
      originalName: 'cover.png',
      mimeType: 'image/png',
      sizeBytes: imageBytes.byteLength,
      createdAt: expect.any(String)
    }
  });

  await expect(
    fs.readFile(resolveAttachmentStoragePath(hashBytes(imageBytes), path.join(mockedDocumentsDir, 'Foliole', 'Assets'), 'cover.png'))
  ).resolves.toEqual(imageBytes);
  await expect(fs.access(path.join(mockedDocumentsDir, 'Foliole', 'Assets', hashBytes(imageBytes)))).rejects.toThrow();
  expect(findAttachmentBlobManifestById(hashBytes(imageBytes))).toEqual({
    attachmentId: hashBytes(imageBytes),
    contentHash: hashBytes(imageBytes),
    storageKey: `${hashBytes(imageBytes)}.png`,
    sizeBytes: imageBytes.byteLength,
    mimeType: 'image/png',
    availability: 'local',
    sourceDeviceId: null,
    createdAt: expect.any(String),
    cachedAt: expect.any(String),
    lastVerifiedAt: expect.any(String)
  });
  expect(openDatabaseConnection().driver.queryOne<{ object_type: string; sync_dirty: number }>(
    `SELECT object_type, sync_dirty FROM sync_object_state WHERE object_type = 'attachment' AND object_id = ?`,
    [hashBytes(imageBytes)]
  )).toEqual({ object_type: 'attachment', sync_dirty: 1 });
  expectAttachmentSyncState(hashBytes(imageBytes), imageBytes.byteLength);
});

it('reuses the same stored file and attachment record for repeated imports of identical content', async () => {
  seedNode('node-1');
  seedNode('node-2');
  const sharedBytes = createPngBytes();
  const firstSourcePath = path.join(tempRoot, 'first.png');
  const secondSourcePath = path.join(tempRoot, 'second.png');

  await fs.writeFile(firstSourcePath, sharedBytes);
  await fs.writeFile(secondSourcePath, sharedBytes);

  const firstResult = await importLocalImageAttachment('node-1', firstSourcePath);
  const secondResult = await importLocalImageAttachment('node-2', secondSourcePath);

  expect(firstResult).toMatchObject({
    status: 'imported',
    attachment_record: 'created',
    stored_file: 'created'
  });
  expect(secondResult).toMatchObject({
    status: 'imported',
    attachment_id: (firstResult as { attachment_id: string }).attachment_id,
    attachment_record: 'reused',
    stored_file: 'reused'
  });

  expect(countAttachments()).toBe(1);
  expect(findAttachmentBlobManifestById((firstResult as { attachment_id: string }).attachment_id)).toMatchObject({
    attachmentId: (firstResult as { attachment_id: string }).attachment_id,
    contentHash: (firstResult as { attachment_id: string }).attachment_id,
    storageKey: `${(firstResult as { attachment_id: string }).attachment_id}.png`,
    availability: 'local'
  });
  expect(listAttachmentNodeLinks((firstResult as { attachment_id: string }).attachment_id)).toEqual([
    { nodeId: 'node-1', attachmentId: (firstResult as { attachment_id: string }).attachment_id, role: 'image' },
    { nodeId: 'node-2', attachmentId: (firstResult as { attachment_id: string }).attachment_id, role: 'image' }
  ]);
});

it('rejects files whose bytes do not match the declared image type', async () => {
  seedNode('node-1');
  const sourcePath = path.join(tempRoot, 'cover.png');

  await fs.writeFile(sourcePath, Buffer.from('<html>not an image</html>'));

  await expect(importLocalImageAttachment('node-1', sourcePath)).resolves.toEqual({
    status: 'error',
    error_code: 'unsupported_format',
    message: 'The image bytes do not match the declared image format.',
    source_path: sourcePath
  });
  expect(countAttachments()).toBe(0);
});

it('returns explicit errors for unsupported formats and missing source files', async () => {
  seedNode('node-1');

  await expect(importLocalImageAttachment('node-1', path.join(tempRoot, 'vector.svg'))).resolves.toEqual({
    status: 'error',
    error_code: 'unsupported_format',
    message: 'Only png, jpg, jpeg, webp, and gif images are supported.',
    source_path: path.join(tempRoot, 'vector.svg')
  });

  await expect(importLocalImageAttachment('node-1', path.join(tempRoot, 'missing.png'))).resolves.toEqual({
    status: 'error',
    error_code: 'source_not_found',
    message: 'The source image file does not exist.',
    source_path: path.join(tempRoot, 'missing.png')
  });
});

it('returns an explicit error when the app cannot persist the image file', async () => {
  seedNode('node-1');
  const sourcePath = path.join(tempRoot, 'cover.png');
  const imageBytes = createPngBytes();

  await fs.writeFile(sourcePath, imageBytes);
  const assetsDir = path.join(mockedDocumentsDir, 'Foliole', 'Assets');
  await fs.rm(assetsDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(assetsDir), { recursive: true });
  await fs.writeFile(assetsDir, 'not-a-directory');

  await expect(importLocalImageAttachment('node-1', sourcePath)).resolves.toEqual({
    status: 'error',
    error_code: 'storage_write_failed',
    message: 'The image could not be stored by the app.',
    source_path: sourcePath
  });
  expect(countAttachments()).toBe(0);
});
