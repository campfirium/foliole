// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-attachment-resource-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createAttachmentRecord } from '../database/attachments.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { resolveAttachmentResource, resolveAttachmentStoragePath } from './resourceResolver.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-attachment-resource-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  vi.restoreAllMocks();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createImageAttachment() {
  createAttachmentRecord({
    id: 'attachment-1',
    hash: 'hash-1',
    originalName: 'diagram.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    createdAt: '2026-03-20T00:00:00.000Z'
  });
}

it('returns a unified attachment resource URL when the record and file both exist', async () => {
  createImageAttachment();
  const storedFilePath = resolveAttachmentStoragePath('hash-1', mockedAppDataDir);

  await fs.mkdir(path.dirname(storedFilePath), { recursive: true });
  await fs.writeFile(storedFilePath, 'image-bytes');

  expect(resolveAttachmentResource('attachment-1', mockedAppDataDir)).toEqual({
    status: 'ready',
    mime_type: 'image/png',
    resource_url: pathToFileURL(storedFilePath).toString()
  });
});

it('returns a distinct not-found result for unknown attachment ids', () => {
  expect(resolveAttachmentResource('missing-id', mockedAppDataDir)).toEqual({
    status: 'not_found',
    resource_url: null
  });
});

it('returns a distinct missing-file result and logs a warning when the file is gone', () => {
  createImageAttachment();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  expect(resolveAttachmentResource('attachment-1', mockedAppDataDir)).toEqual({
    status: 'missing_file',
    mime_type: 'image/png',
    resource_url: null
  });
  expect(warn).toHaveBeenCalledWith(
    '[native] attachment resource file missing',
    expect.objectContaining({
      area: 'native',
      action: 'resolve_attachment_resource',
      attachment_id: 'attachment-1',
      hash: 'hash-1',
      fallback: 'return_missing_file',
      expected_path: resolveAttachmentStoragePath('hash-1', mockedAppDataDir)
    })
  );
});
