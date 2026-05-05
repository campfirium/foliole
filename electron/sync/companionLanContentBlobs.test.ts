// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-content-blob-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { loadCompanionContentBlobResource } from './companionLanContentBlobs.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-content-blob-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('loads text body blob bytes by content hash', async () => {
  const hash = upsertTextBodyBlob(
    openDatabaseConnection().driver,
    'desktop body bytes',
    '2026-04-27T00:00:00.000Z'
  );

  await expect(loadCompanionContentBlobResource(hash)).resolves.toEqual({
    body: Buffer.from('desktop body bytes'),
    mimeType: 'text/plain',
    status: 'ready'
  });
});

it('rejects invalid and missing content blob hashes', async () => {
  await expect(loadCompanionContentBlobResource('not-a-hash')).resolves.toEqual({
    error: 'invalid_hash',
    status: 'error',
    statusCode: 400
  });
  await expect(loadCompanionContentBlobResource('a'.repeat(64))).resolves.toEqual({
    error: 'blob_not_found',
    status: 'error',
    statusCode: 404
  });
});
