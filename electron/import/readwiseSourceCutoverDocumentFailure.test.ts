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
  canCurrentHostRunReadwise: (mode = 'relay') => mode === 'relay',
  loadReadwiseHostAssignment: () => ({ current_host_name: 'This Mac', is_active: true })
}));
vi.mock('./readwiseApiConnectionState.js', async () => {
  const { createDefaultReadwiseReaderConfig } = await import(
    '../../lib/core/import/readwiseReaderSettings.js'
  );
  return {
    isStoredReadwiseApiConnectionReady: () => true,
    loadStoredReadwiseHostSettings: () => ({
      apiConnection: { secretRef: 'readwise-secret', state: 'connected' },
      readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
      readwiseSourceMode: 'folder'
    })
  };
});
vi.mock('./importManagerSettings.js', async () => {
  const { createDefaultReadwiseAutoImportPolicy } = await import(
    '../../lib/core/import/readwiseAutoImportPolicy.js'
  );
  const { createDefaultReadwiseReaderConfig } = await import(
    '../../lib/core/import/readwiseReaderSettings.js'
  );
  return { loadImportManagerSettings: () => ({
    readwiseAutoImportPolicy: createDefaultReadwiseAutoImportPolicy(),
    readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
    readwiseSources: []
  }) };
});
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'secret' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { previewReadwiseSourceCutover, runReadwiseSourceCutover } from './readwiseSourceCutover.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-document-failure-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  openDatabaseConnection().driver.execute(
    "INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES " +
    "('readwise_source_mode','{\"mode\":\"relay\",\"version\":1}','old')"
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('times out one document, records it, and completes the remaining migration', async () => {
  const fetchImpl = migrationWithHungOriginalFile();
  await expect(runReadwiseSourceCutover({
    dependencies: { cutoverDocumentTimeoutMs: 5, fetchImpl, minIntervalMs: 0 }
  })).resolves.toMatchObject({ status: 'completed' });

  const journal = JSON.parse(openDatabaseConnection().driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'"
  )?.value ?? '{}');
  expect(journal).toMatchObject({
    documents: expect.arrayContaining([
      expect.objectContaining({ remoteId: 'document-1', status: 'unavailable' }),
      expect.objectContaining({ remoteId: 'document-2', status: 'materialized' })
    ]),
    failures: [{
      reason: 'readwise_source_cutover_document_timeout',
      remoteId: 'document-1',
      stage: 'resources',
      title: 'Broken PDF'
    }],
    status: 'api'
  });
  expect(journal.activeDocument).toBeUndefined();
  await expect(previewReadwiseSourceCutover()).resolves.toMatchObject({
    failed_items: [{
      reason: 'readwise_source_cutover_document_timeout',
      remote_id: 'document-1',
      stage: 'resources',
      title: 'Broken PDF'
    }],
    status: 'already_completed'
  });
});

function migrationWithHungOriginalFile(): typeof fetch {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname.endsWith('.amazonaws.com')) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('timed out', 'AbortError'));
        }, { once: true });
      });
    }
    if (url.pathname === '/api/v2/export/') {
      return Response.json({ count: 1, nextPageCursor: null, results: [{
        external_id: 'document-2', highlights: [{ external_id: 'highlight-2', text: 'Useful text' }],
        source: 'reader'
      }] });
    }
    return Response.json({ count: 3, nextPageCursor: null, results: [{
      category: 'pdf', html_content: '<p>Fallback body</p>', id: 'document-1',
      parent_id: null, raw_source_url: 'https://bucket.s3.amazonaws.com/broken.pdf', title: 'Broken PDF'
    }, {
      category: 'article', html_content: '<p>Useful text</p>', id: 'document-2',
      parent_id: null, title: 'Working article'
    }, {
      category: 'highlight', id: 'highlight-2', parent_id: 'document-2', title: 'Working article'
    }] });
  }) as typeof fetch;
}
