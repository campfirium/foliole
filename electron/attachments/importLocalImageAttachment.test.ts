// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-image-attachment-import-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { listAttachmentNodeLinks, listNodeAttachments } from '../database/attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { importLocalImageAttachment } from './importLocalImageAttachment.js';
import { resolveAttachmentStoragePath } from './resourceResolver.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-image-attachment-import-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
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

it('imports a local png into the app attachment directory and links it to the node', async () => {
  seedNode('node-1');
  const sourcePath = path.join(tempRoot, 'cover.png');
  const imageBytes = Buffer.from('png-image-bytes');

  await fs.writeFile(sourcePath, imageBytes);

  await expect(importLocalImageAttachment('node-1', sourcePath)).resolves.toEqual({
    status: 'imported',
    attachment_id: expect.any(String),
    attachment_record: 'created',
    created_at: expect.any(String),
    hash: hashBytes(imageBytes),
    mime_type: 'image/png',
    original_name: 'cover.png',
    size_bytes: imageBytes.byteLength,
    stored_file: 'created'
  });

  const [nodeAttachment] = listNodeAttachments('node-1');
  expect(nodeAttachment).toEqual({
    nodeId: 'node-1',
    attachmentId: expect.any(String),
    role: 'image',
    attachment: {
      id: expect.any(String),
      hash: hashBytes(imageBytes),
      originalName: 'cover.png',
      mimeType: 'image/png',
      sizeBytes: imageBytes.byteLength,
      createdAt: expect.any(String)
    }
  });

  await expect(fs.readFile(resolveAttachmentStoragePath(hashBytes(imageBytes), mockedAppDataDir))).resolves.toEqual(imageBytes);
});

it('reuses the same stored file and attachment record for repeated imports of identical content', async () => {
  seedNode('node-1');
  seedNode('node-2');
  const sharedBytes = Buffer.from('shared-image-bytes');
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
  expect(listAttachmentNodeLinks((firstResult as { attachment_id: string }).attachment_id)).toEqual([
    { nodeId: 'node-1', attachmentId: (firstResult as { attachment_id: string }).attachment_id, role: 'image' },
    { nodeId: 'node-2', attachmentId: (firstResult as { attachment_id: string }).attachment_id, role: 'image' }
  ]);
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
  const imageBytes = Buffer.from('png-image-bytes');

  await fs.writeFile(sourcePath, imageBytes);
  await fs.mkdir(mockedAppDataDir, { recursive: true });
  await fs.writeFile(path.join(mockedAppDataDir, 'attachments'), 'not-a-directory');

  await expect(importLocalImageAttachment('node-1', sourcePath)).resolves.toEqual({
    status: 'error',
    error_code: 'storage_write_failed',
    message: 'The image could not be stored by the app.',
    source_path: sourcePath
  });
  expect(countAttachments()).toBe(0);
});
