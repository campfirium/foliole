// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-clipboard-image-attachment-import-tests';
let mockedDocumentsDir = '/tmp/foliole-clipboard-image-attachment-import-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { listNodeAttachments } from '../database/attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { importClipboardImageAttachment } from './importClipboardImageAttachment.js';
import { resolveAttachmentStoragePath } from './resourceResolver.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-clipboard-image-attachment-import-'));
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
    .run(nodeId, null, nodeId, 1, 0, '', null, null, '2026-03-30T00:00:00.000Z', '2026-03-30T00:00:00.000Z', null);
}

it('imports pasted clipboard image bytes into attachments and links them to the node', async () => {
  seedNode('node-1');
  const imageBytes = Buffer.from('clipboard-image-bytes');
  const hash = createHash('sha256').update(imageBytes).digest('hex');

  await expect(
    importClipboardImageAttachment({
      bytesBase64: imageBytes.toString('base64'),
      mimeType: 'image/png',
      nodeId: 'node-1',
      originalName: ''
    })
  ).resolves.toEqual({
    status: 'imported',
    attachment_id: hash,
    attachment_record: 'created',
    created_at: expect.any(String),
    hash,
    mime_type: 'image/png',
    original_name: 'pasted-image.png',
    size_bytes: imageBytes.byteLength,
    stored_file: 'created'
  });

  const [nodeAttachment] = listNodeAttachments('node-1');
  expect(nodeAttachment?.attachment.originalName).toBe('pasted-image.png');
  await expect(
    fs.readFile(resolveAttachmentStoragePath(hash, path.join(mockedDocumentsDir, 'Foliole', 'Assets'), 'pasted-image.png'))
  ).resolves.toEqual(imageBytes);
});
