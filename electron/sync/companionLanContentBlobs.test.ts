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

import {
  acknowledgeCompanionContentBlobs,
  loadCompanionContentBlobBatch,
  loadCompanionContentBlobResource
} from './companionLanContentBlobs.js';

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

it('loads a batch of text body blobs by content hash', () => {
  const firstHash = upsertTextBodyBlob(
    openDatabaseConnection().driver,
    'first body',
    '2026-04-27T00:00:00.000Z'
  );
  const secondHash = upsertTextBodyBlob(
    openDatabaseConnection().driver,
    'second body',
    '2026-04-27T00:00:01.000Z'
  );

  const batch = loadCompanionContentBlobBatch(JSON.stringify({
    hashes: [firstHash, secondHash, 'a'.repeat(64)]
  }));
  expect(batch.status).toBe('ready');
  if (batch.status !== 'ready') return;
  const bodyText = batch.body.toString('utf8');
  expect(batch.mimeType).toMatch(/^multipart\/mixed; boundary=foliole-content-blobs-/);
  expect(batch.missingHashes).toEqual(['a'.repeat(64)]);
  expect(bodyText).toContain(`X-Blob-Hash: ${firstHash}`);
  expect(bodyText).toContain('Content-Length: 10');
  expect(bodyText).toContain('\r\n\r\nfirst body\r\n');
  expect(bodyText).toContain(`X-Blob-Hash: ${secondHash}`);
  expect(bodyText).toContain('\r\n\r\nsecond body\r\n');
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

it('acknowledges validated content blob hashes', () => {
  const hash = 'a'.repeat(64);

  expect(acknowledgeCompanionContentBlobs(JSON.stringify({ hashes: [hash] }))).toEqual({
    acked_hashes: [hash],
    status: 'ok'
  });
  expect(acknowledgeCompanionContentBlobs(JSON.stringify({ hashes: ['not-a-hash'] }))).toEqual({
    error: 'invalid_hashes',
    status: 'error',
    statusCode: 400
  });
});
