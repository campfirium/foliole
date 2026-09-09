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
  const { createDefaultReadwiseReaderConfig } = await import('../../lib/core/import/readwiseReaderSettings.js');
  return { loadImportManagerSettings: () => ({
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
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

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

it('counts only active Topics imported by this Host', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('local-topic',NULL,'topic','Local',0,'body','old','old'),
      ('other-topic',NULL,'topic','Other',0,'body','old','old')`);
  driver.execute(`INSERT INTO desktop_sources (source_ref,source_type,config_ref,host_name,host_platform,
    root_path,path_flavor,type_settings_json,created_at,updated_at) VALUES
    ('readwise:local','readwise','articles-local','This Mac','darwin',?,'posix','{}','old','old'),
    ('readwise:other','readwise','articles-other','Other Mac','darwin',?,'posix','{}','old','old')`,
  [state.sourcePath, state.sourcePath]);
  driver.execute(`INSERT INTO import_sources (source_fingerprint,provider,source_kind,source_name,source_locator,
    first_imported_at,last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location) VALUES
    ('local','desktop_text_file','markdown','Local.md','Local.md','old','old','hash','local-topic','readwise:local','Local.md'),
    ('other','desktop_text_file','markdown','Other.md','Other.md','old','old','hash','other-topic','readwise:other','Other.md')`);

  await expect(previewReadwiseSourceCutover()).resolves.toEqual({
    completed_count: 0, status: 'ready', topic_count: 1, total_count: null
  });
});

it('does not inspect relay directories before the user confirms migration', async () => {
  state.sourcePath = path.join(tempRoot, 'missing');
  await expect(previewReadwiseSourceCutover()).resolves.toEqual({
    completed_count: 0, status: 'ready', topic_count: 0, total_count: null
  });
});

it('reprojects a pristine body atomically while preserving a local cloze', async () => {
  await seedMigratableSource();
  ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');
  vi.stubGlobal('fetch', migrationFetch());

  await expect(runReadwiseSourceCutover()).resolves.toMatchObject({ migrated_count: 1, status: 'completed' });
  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='topic-1'")?.content)
    .toContain('API body with remembered phrase.');
  expect(driver.queryOne<{ anchor_link: string; content: string }>(
    "SELECT anchor_link, content FROM nodes WHERE id='local-cloze'"
  )).toMatchObject({
    anchor_link: expect.stringContaining('remembered phrase'),
    content: 'Local answer'
  });
  expect(driver.queryOne<{ value: string }>("SELECT value FROM settings WHERE key='readwise_source_cutover'"))
    .toBeTruthy();
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
    ('readwise:local','readwise','articles-local','This Mac','darwin',?,'posix',?,'old','old')`,
  [state.sourcePath, JSON.stringify({ highlightPath: state.sourcePath, keepState: 'enabled', kind: 'articles' })]);
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
  }) as typeof fetch;
}
