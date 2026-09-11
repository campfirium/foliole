// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: () => true
}));
vi.mock('../database/readwiseRemoteIdentity.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../database/readwiseRemoteIdentity.js')>()),
  loadReadwiseRemoteSource: () => ({
    connectionRef: 'connection', createdAt: 'created', updatedAt: 'updated', version: 1
  })
}));
vi.mock('./readwiseApiConnectionState.js', () => ({
  loadStoredReadwiseHostSettings: () => ({
    apiConnection: { secretRef: 'readwise-api-00000000-0000-4000-8000-000000000001.bin', state: 'connected' },
    readwiseSourceMode: 'api'
  })
}));
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'SECRET' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { loadReadwiseApiExternalDocumentState } from '../database/readwiseApiExternalDocuments.js';

import { previewReadwiseApiImport, runReadwiseApiImport } from './readwiseApiImportRun.js';
import { readerDocument, response } from './readwiseApiImportRun.testSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-api-external-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('preserves an existing External document when its incremental scope is turned off', async () => {
  const externalSettings = settings('external');
  const firstFetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) return response([]);
    if (url.searchParams.get('category') === 'article') {
      return response([readerDocument('plain', 'article', false)]);
    }
    if (url.searchParams.has('category')) return response([]);
    return response([readerDocument('plain', 'article')]);
  }) as typeof fetch;
  await runReadwiseApiImport({
    dependencies: { fetchImpl: firstFetch, minIntervalMs: 0 },
    settings: externalSettings
  });
  expect(loadReadwiseApiExternalDocumentState('connection', 'plain')?.is_present).toBe(1);

  const secondFetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    expect(url.searchParams.get('category')).not.toBe('article');
    return response([]);
  }) as typeof fetch;
  await previewReadwiseApiImport(settings('off'), { fetchImpl: secondFetch, minIntervalMs: 0 });

  expect(secondFetch).toHaveBeenCalledTimes(3);
  expect(loadReadwiseApiExternalDocumentState('connection', 'plain')?.is_present).toBe(1);
});

function settings(destination: 'external' | 'off') {
  const value = createDefaultImportManagerSettings();
  return {
    ...value,
    readwiseAutoImportPolicy: {
      ...value.readwiseAutoImportPolicy,
      articleWithoutHighlights: destination,
      emailWithoutHighlights: destination,
      epubWithoutHighlights: destination,
      pdfWithoutHighlights: destination,
      rssWithoutHighlights: destination,
      tweetWithoutHighlights: destination,
      videoWithoutHighlights: destination
    },
    readwiseSourceMode: 'api' as const
  };
}
