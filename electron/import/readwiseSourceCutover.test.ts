// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
const state = vi.hoisted(() => ({ sourcePath: '' }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: () => true,
  loadReadwiseHostAssignment: () => ({ current_host_name: 'This Mac', is_active: true })
}));
vi.mock('./readwiseApiConnectionState.js', async () => {
  const { createDefaultReadwiseReaderConfig } = await import('../../lib/core/import/readwiseReaderSettings.js');
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
  const { createDefaultReadwiseAutoImportPolicy } = await import('../../lib/core/import/readwiseAutoImportPolicy.js');
  const { createDefaultReadwiseReaderConfig } = await import('../../lib/core/import/readwiseReaderSettings.js');
  return { loadImportManagerSettings: () => ({
    readwiseAutoImportPolicy: createDefaultReadwiseAutoImportPolicy(),
    readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
    readwiseSources: [{
      highlightMode: 'split', highlightPath: state.sourcePath, id: 'local', keepState: 'enabled',
      kind: 'articles', primaryPath: state.sourcePath
    }]
  }) };
});
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'secret' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { completeReadwiseApiImportRun } from '../database/readwiseApiImportState.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { runReadwiseSourceCutover } from './readwiseSourceCutover.js';
import {
  migrationFetch,
  seedMigratableSource
} from './readwiseSourceCutoverTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-cutover-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  state.sourcePath = path.join(tempRoot, 'Readwise');
  await fs.mkdir(state.sourcePath, { recursive: true });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('starts migration from the complete selected candidate scope instead of the ordinary watermark', async () => {
  const remote = ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  writeReadwiseSourceCutover({
    annotations: [], cohortDocumentIds: [], completedAt: '2026-09-09T01:00:00.000Z',
    documents: [], retiredNodeIds: ['retired-1'], sourceHost: 'This Mac',
    startedAt: '2026-09-09T00:00:00.000Z', status: 'migration-in-progress'
  });
  completeReadwiseApiImportRun({
    connectionRef: remote.connectionRef,
    exportCursor: null,
    phase: 'ready',
    queryUpdatedAfter: null,
    readerCursor: null,
    roundStartedAt: '2026-09-08T00:00:00.000Z'
  });
  const requests: string[] = [];
  let mergingStarted = false;
  const baseFetch = migrationFetch();
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    if (mergingStarted) throw new Error('network_called_during_merge');
    requests.push(String(input));
    return baseFetch(input);
  }) as typeof fetch;
  const send = vi.fn((_: string, payload: {
    phase?: string; processedCount?: number; totalCount?: number;
  }) => {
    if (payload.phase === 'merging') mergingStarted = true;
  });

  await expect(runReadwiseSourceCutover({
    dependencies: { fetchImpl, minIntervalMs: 0 },
    window: { isDestroyed: () => false, webContents: { send } }
  }))
    .resolves.toMatchObject({ migrated_count: 1, status: 'completed', unmatched_count: 0 });
  const driver = openDatabaseConnection().driver;
  const materialized = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_provider='readwise' AND remote_document_id='document-1'"
  );
  if (!materialized?.latest_node_id) throw new Error('missing materialized document');
  expect(driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id=?', [materialized.latest_node_id])?.content)
    .toContain('API body with remembered phrase.');
  expect(send.mock.calls.map(([, payload]) => payload.phase)).toEqual(expect.arrayContaining(['indexing', 'merging']));
  expect(send.mock.calls.map(([, payload]) => payload).some((payload) =>
    payload.phase === 'indexing' && (payload.processedCount ?? 0) > 0 && (payload.totalCount ?? 0) > 0
  )).toBe(true);
  expect(send.mock.calls.findIndex(([, payload]) => payload.phase === 'indexing'))
    .toBeLessThan(send.mock.calls.findIndex(([, payload]) => payload.phase === 'merging'));
  const exportRequest = requests.map((input) => new URL(input))
    .find((url) => url.pathname === '/api/v2/export/');
  expect(exportRequest?.searchParams.has('updatedAfter')).toBe(false);
});

it('reprojects a pristine body atomically while preserving a local cloze', async () => {
  await seedMigratableSource(state.sourcePath);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  const fetchImpl = migrationFetch();
  vi.stubGlobal('fetch', fetchImpl);

  await expect(runReadwiseSourceCutover({ dependencies: { minIntervalMs: 0 } }))
    .resolves.toMatchObject({ migrated_count: 1, status: 'completed' });
  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='topic-1'")?.content)
    .toContain('API body with remembered phrase.');
  expect(driver.queryOne<{ anchor_link: string; content: string }>(
    "SELECT anchor_link, content FROM nodes WHERE id='local-cloze'"
  )).toMatchObject({
    anchor_link: expect.stringContaining('remembered phrase'),
    content: 'Local answer'
  });
  const legacyState = driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_cutover'"
  );
  const journalState = driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'"
  );
  expect(JSON.parse(legacyState?.value ?? '{}')).toMatchObject({ status: 'api', version: 1 });
  expect(JSON.parse(journalState?.value ?? '{}')).toMatchObject({
    completionVersion: 2,
    cohortDocumentIds: ['document-1'],
    documents: [{ nodeId: 'topic-1', remoteId: 'document-1', status: 'bound' }],
    status: 'api',
    version: 2
  });
  const requestUrls = fetchImpl.mock.calls.map(([input]) => new URL(String(input)));
  expect(requestUrls.filter((url) => url.pathname === '/api/v2/export/')).toHaveLength(1);
  const documentRequests = requestUrls.filter((url) => url.searchParams.get('id') === 'document-1');
  expect(documentRequests).toHaveLength(1);
  expect(documentRequests[0]?.searchParams.get('withHtmlContent')).toBe('true');
  expect(requestUrls.filter((url) => url.searchParams.get('id') === 'highlight-1')).toHaveLength(0);
}, 20_000);
