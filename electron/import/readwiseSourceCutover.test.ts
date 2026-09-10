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
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { completeReadwiseApiImportRun } from '../database/readwiseApiImportState.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { runReadwiseApiImport } from './readwiseApiImportRun.js';
import { readwiseKeepAdapter } from './readwiseKeepAdapter.js';
import { runReadwiseSourceCutover, previewReadwiseSourceCutover } from './readwiseSourceCutover.js';
import { resolveReadwiseTopicMergeSource } from './readwiseTopicMergeSource.js';

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
  completeReadwiseApiImportRun({
    connectionRef: remote.connectionRef,
    exportCursor: null,
    phase: 'ready',
    queryUpdatedAfter: null,
    readerCursor: null,
    roundStartedAt: '2026-09-08T00:00:00.000Z'
  });
  const requests: string[] = [];
  const baseFetch = migrationFetch();
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    requests.push(String(input));
    return baseFetch(input);
  }) as typeof fetch;

  await expect(runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } }))
    .resolves.toMatchObject({ migrated_count: 0, status: 'completed', unmatched_count: 1 });
  const exportRequest = requests.map((input) => new URL(input))
    .find((url) => url.pathname === '/api/v2/export/');
  expect(exportRequest?.searchParams.has('updatedAfter')).toBe(false);
});

it('reprojects a pristine body atomically while preserving a local cloze', async () => {
  await seedMigratableSource();
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
    cohortDocumentIds: ['document-1'],
    documents: [{ nodeId: 'topic-1', remoteId: 'document-1', status: 'bound' }],
    status: 'api',
    version: 2
  });
  const requestUrls = fetchImpl.mock.calls.map(([input]) => new URL(String(input)));
  expect(requestUrls.filter((url) => url.pathname === '/api/v2/export/')).toHaveLength(1);
  const documentRequests = requestUrls.filter((url) => url.searchParams.get('id') === 'document-1');
  expect(documentRequests).toHaveLength(2);
  expect(documentRequests.map((url) => url.searchParams.get('withHtmlContent'))).toEqual([null, 'true']);
  expect(requestUrls.filter((url) => url.searchParams.get('id') === 'highlight-1')).toHaveLength(1);
}, 20_000);

it('keeps the irreversible migration state after a network failure', async () => {
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

  await expect(runReadwiseSourceCutover({ dependencies: { minIntervalMs: 0 } }))
    .resolves.toMatchObject({ status: 'failed' });
  await expect(previewReadwiseSourceCutover()).resolves.toMatchObject({
    completed_count: 0,
    status: 'migration_in_progress'
  });
});

it('binds an old document first seen after cutover to its exact original Topic', async () => {
  await seedMigratableSource();
  const remote = ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  writeReadwiseSourceCutover({
    annotations: [],
    cohortDocumentIds: [],
    completedAt: '2026-09-09T01:00:00.000Z',
    documents: [],
    retiredNodeIds: [],
    sourceHost: 'This Mac',
    startedAt: '2026-09-09T00:00:00.000Z',
    status: 'api'
  }, '2026-09-09T01:00:00.000Z');
  const fetchImpl = migrationFetch();

  await expect(runReadwiseApiImport({ dependencies: { fetchImpl, minIntervalMs: 0 } }))
    .resolves.toMatchObject({ status: 'completed' });
  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_connection_ref=? AND remote_document_id='document-1'",
    [remote.connectionRef]
  )?.latest_node_id).toBe('topic-1');
  const journal = JSON.parse(driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'"
  )?.value ?? '{}') as { cohortDocumentIds: string[]; documents: unknown[] };
  expect(journal.cohortDocumentIds).toEqual([]);
  expect(journal.documents).toContainEqual({
    nodeId: 'topic-1', remoteId: 'document-1', status: 'bound'
  });
}, 20_000);

async function seedMigratableSource() {
  await fs.writeFile(path.join(state.sourcePath, 'Sample.md'), [
    '# Sample', '## Full Document', 'Legacy body with remembered phrase.',
    'https://read.readwise.io/read/document-1', '## Highlights',
    'remembered phrase [...] (https://read.readwise.io/read/highlight-1)'
  ].join('\n'));
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,anchor_link,created_at,updated_at)
    VALUES ('topic-1',NULL,'topic','Sample',0,'placeholder',NULL,'old','old'),
      ('local-cloze','topic-1','cloze','Local',1,'Local answer',
       '{"id":"local","kind":"cloze","locator":{"from":17,"to":34,"originalText":"remembered phrase"}}','old','old')`);
  driver.execute(`INSERT INTO desktop_sources (source_ref,source_type,config_ref,host_name,host_platform,
    root_path,path_flavor,type_settings_json,created_at,updated_at) VALUES
    ('readwise:local','readwise','articles-local','This Mac',?,?,?,?, 'old','old')`,
  [process.platform, state.sourcePath, process.platform === 'win32' ? 'windows' : 'posix',
    JSON.stringify({ highlightPath: state.sourcePath, keepState: 'enabled', kind: 'articles' })]);
  driver.execute(`INSERT INTO import_sources (source_fingerprint,provider,source_kind,source_name,source_locator,
    first_imported_at,last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location) VALUES
    ('source-1','desktop_text_file','markdown','Sample.md',?,'old','old','hash','topic-1','readwise:local','Sample.md')`,
  [path.join(state.sourcePath, 'Sample.md')]);
  const merge = await resolveReadwiseTopicMergeSource('topic-1');
  if (!merge) throw new Error('missing merge source');
  const prepared = await readwiseKeepAdapter.loadPreparedRecord(merge.descriptor, {
    highlightDirectoryPath: merge.readwiseSource.highlightPath,
    highlightPolicy: 'reference_only',
    importedAt: 'old',
    kind: merge.readwiseSource.kind,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  driver.execute("UPDATE nodes SET content=? WHERE id='topic-1'", [prepared.content]);
}

function migrationFetch() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v2/export/') {
      return Response.json({ nextPageCursor: null, results: [{
        external_id: 'document-1', highlights: [{ external_id: 'highlight-1', text: 'remembered phrase' }],
        source: 'reader'
      }] });
    }
    const id = url.searchParams.get('id');
    if (id) {
      return Response.json({ results: [{
        category: id === 'highlight-1' ? 'highlight' : 'article', id,
        ...(id === 'document-1' ? { html_content: '<p>API body with remembered phrase.</p>', title: 'Sample' } : {}),
        parent_id: id === 'highlight-1' ? 'document-1' : null
      }] });
    }
    return Response.json({ nextPageCursor: null, results: [
      { category: 'article', html_content: '<p>API body with remembered phrase.</p>', id: 'document-1', title: 'Sample' },
      { category: 'highlight', id: 'highlight-1', parent_id: 'document-1' }
    ] });
  });
}
