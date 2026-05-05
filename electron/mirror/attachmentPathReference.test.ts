// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-mirror-attachment-path-app-data';
let mockedDocumentsDir = '/tmp/foliole-mirror-attachment-path-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createAttachmentRecord } from '../database/attachments.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { resolveMirrorAttachmentPath } from './attachmentPathReference.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-attachment-path-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('points mirror attachment references at the shared library asset path without creating a mirror attachment tree', async () => {
  createAttachmentRecord({
    id: 'hash-1',
    originalName: 'cover.png',
    mimeType: 'image/png',
    sizeBytes: 12,
    createdAt: '2026-03-30T00:00:00.000Z'
  });

  const firstPath = resolveMirrorAttachmentPath('hash-1');
  const secondPath = resolveMirrorAttachmentPath('hash-1');
  const expectedPath = path.join(mockedDocumentsDir, 'Foliole', 'Assets', 'hash-1.png');
  const mirrorAssetsDir = path.join(mockedDocumentsDir, 'Foliole', 'Mirror', 'Assets');

  expect(firstPath).toBe(expectedPath);
  expect(secondPath).toBe(expectedPath);
  await expect(fs.access(mirrorAssetsDir)).rejects.toThrow();
});
