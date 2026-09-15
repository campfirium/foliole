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
  openDatabaseConnection().driver.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('readwise_source_mode', '{\"mode\":\"relay\",\"version\":1}', '2026-09-08T00:00:00.000Z')");
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

it('reruns the API migration instead of accepting a historical v2 completion', async () => {
  await seedMigratableSource(state.sourcePath);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  writeReadwiseSourceCutover({
    annotations: [], cohortDocumentIds: ['old-document'], completedAt: '2026-09-11T01:00:00.000Z',
    completionVersion: 2,
    documents: [{ nodeId: 'old-topic', remoteId: 'old-document', status: 'materialized' }],
    phase: null, retiredNodeIds: [], sourceHost: 'This Mac',
    startedAt: '2026-09-11T00:00:00.000Z', status: 'api'
  });
  const fetchImpl = migrationFetch();

  await expect(runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } }))
    .resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  expect(fetchImpl).toHaveBeenCalled();
  const journal = JSON.parse(openDatabaseConnection().driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'"
  )?.value ?? '{}');
  expect(journal).toMatchObject({
    cohortDocumentIds: ['document-1'], completionVersion: 3, status: 'api'
  });
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
    completionVersion: 3,
    cohortDocumentIds: ['document-1'],
    documents: [{ nodeId: 'topic-1', remoteId: 'document-1', status: 'bound' }],
    status: 'api',
    version: 2
  });
  expect(JSON.parse(driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_mode'"
  )?.value ?? '{}')).toEqual({
    completion: {
      batchId: expect.any(String),
      completedAt: expect.any(String),
      sourceHost: 'This Mac',
      startedAt: expect.any(String)
    },
    mode: 'api', version: 1
  });
  const requestUrls = fetchImpl.mock.calls.map(([input]) => new URL(String(input)));
  expect(requestUrls.filter((url) => url.pathname === '/api/v2/export/')).toHaveLength(1);
  const documentRequests = requestUrls.filter((url) => url.searchParams.get('id') === 'document-1');
  expect(documentRequests).toHaveLength(2);
  expect(documentRequests[0]?.searchParams.has('withHtmlContent')).toBe(false);
  expect(documentRequests[1]?.searchParams.get('withHtmlContent')).toBe('true');
  expect(requestUrls.filter((url) => url.searchParams.get('id') === 'highlight-1')).toHaveLength(0);
}, 20_000);

it('rolls back the final completion record when the source mode cannot commit', async () => {
  await seedMigratableSource(state.sourcePath);
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  const driver = openDatabaseConnection().driver;
  driver.execute(`CREATE TRIGGER reject_readwise_mode_update
    BEFORE UPDATE OF value ON settings WHEN NEW.key = 'readwise_source_mode'
    BEGIN SELECT RAISE(ABORT, 'injected source mode failure'); END`);

  await expect(runReadwiseSourceCutover({
    dependencies: { fetchImpl: migrationFetch(), minIntervalMs: 0 }
  })).resolves.toMatchObject({ error_reason: 'request_failed', status: 'failed' });

  expect(JSON.parse(driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_mode'"
  )?.value ?? '{}')).toEqual({ mode: 'relay', version: 1 });
  expect(JSON.parse(driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'"
  )?.value ?? '{}')).toMatchObject({ status: 'migration-in-progress' });
  expect(driver.queryOne<{ query_updated_after: string | null }>(
    'SELECT query_updated_after FROM readwise_api_import_runs LIMIT 1'
  )).toEqual({ query_updated_after: null });
});

it.each(['dismissed', 'hard_deleted'] as const)(
  'migrates %s folder sources to Readwise ids without fetching or materializing them', async (disposition) => {
    await seedMigratableSource(state.sourcePath);
    const driver = openDatabaseConnection().driver;
    driver.execute(`INSERT INTO keep_import_items (
      rule_id,source_path,source_mtime_ms,source_size_bytes,source_state,local_node_state,
      has_source_update,last_node_id,last_status,first_seen_at,last_seen_at,last_imported_at
    ) VALUES ('local','Sample.md',1,1,'present','active',0,'topic-1','imported','old','old','old')`);
    driver.execute(`INSERT INTO keep_import_item_cache (
      rule_id,source_path,title,source_mtime_ms,source_size_bytes,refreshed_at
    ) VALUES ('local','Sample.md','Sample',1,1,'old')`);
    driver.execute(`INSERT INTO source_disposition_states
      (source_kind,source_scope,original_title,disposition,updated_at)
      VALUES ('readwise','local:.','Sample',?,'old')`, [disposition]);
    const remote = ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
    const fetchImpl = migrationFetch();

    await expect(runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } }))
      .resolves.toMatchObject({ migrated_count: 0, status: 'completed', unmatched_count: 1 });

    expect(driver.queryAll<{ disposition: string; source_scope: string }>(
      'SELECT disposition,source_scope FROM source_disposition_states'
    )).toEqual([{ disposition, source_scope: `api/${remote.connectionRef}/document-1` }]);
    expect(driver.queryOne<{ count: number }>(
      "SELECT COUNT(*) count FROM import_sources WHERE remote_document_id='document-1'"
    )).toEqual({ count: 0 });
    const journal = JSON.parse(driver.queryOne<{ value: string }>(
      "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'"
    )?.value ?? '{}');
    expect(journal.documents).toEqual([{ nodeId: null, remoteId: 'document-1', status: 'suppressed' }]);
    expect(fetchImpl.mock.calls.map(([input]) => new URL(String(input))).filter((url) =>
      url.searchParams.get('id') === 'document-1' && url.searchParams.get('withHtmlContent') === 'true'
    )).toHaveLength(0);
  }
);
