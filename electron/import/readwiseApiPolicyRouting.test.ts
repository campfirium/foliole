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
    apiConnection: {
      secretRef: 'readwise-api-00000000-0000-4000-8000-000000000001.bin',
      state: 'connected'
    },
    readwiseSourceMode: 'api'
  })
}));
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'SECRET' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import { runReadwiseApiImport } from './readwiseApiImportRun.js';
import { apiSettings, exportBook, readerDocument, response } from './readwiseApiImportRun.testSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-api-policy-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('does not download a body or highlights when metadata resolves to an Off cell', async () => {
  const urls: URL[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url);
    if (url.pathname.includes('/v2/export/')) {
      return response([exportBook('off-article', 'off-highlight', 'books')]);
    }
    if (url.searchParams.get('id') === 'off-article') {
      return response([readerDocument('off-article', 'article', false)]);
    }
    throw new Error(`unexpected Off request: ${url}`);
  }) as typeof fetch;
  const base = apiSettings('off');
  const settings = {
    ...base,
    readwiseAutoImportPolicy: {
      ...base.readwiseAutoImportPolicy,
      articleWithHighlights: 'off' as const
    }
  };

  await expect(runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings
  })).resolves.toMatchObject({ committed_count: 0, status: 'completed' });
  expect(urls.some((url) => url.searchParams.has('withHtmlContent'))).toBe(false);
  expect(urls.some((url) => url.searchParams.get('id') === 'off-highlight')).toBe(false);
});
