// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  loadReadwiseHostAssignment: () => ({ current_host_name: 'desktop-test', is_active: true })
}));
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'secret' }));
vi.mock('./readwiseApiConnectionState.js', async () => {
  const { createDefaultReadwiseHostSettings } = await import('../../lib/core/import/readwiseHostSettings.js');
  return {
    isStoredReadwiseApiConnectionReady: () => true,
    loadStoredReadwiseHostSettings: () => ({
      ...createDefaultReadwiseHostSettings(),
      apiConnection: { secretRef: 'readwise-api-00000000-0000-0000-0000-000000000000.bin', state: 'connected' },
      readwiseSourceMode: 'api'
    })
  };
});

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import {
  confirmReadwiseIdentityBindingPreview,
  previewReadwiseIdentityBindings
} from './readwiseIdentityBindingPreview.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-binding-preview-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  await seedSource();
  ensureReadwiseRemoteSource(false, '2026-09-07T00:00:00.000Z');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('previews and confirms a stable Topic and unedited highlight without changing content', async () => {
  const preview = await previewReadwiseIdentityBindings({ fetchImpl: identityFetch(), minIntervalMs: 0 });
  expect(preview).toMatchObject({
    annotation_count: 1, candidate_count: 1, conflict_count: 0, status: 'ready', unmatched_count: 0
  });

  expect(confirmReadwiseIdentityBindingPreview(preview.preview_id!)).toMatchObject({
    annotation_count: 1, bound_count: 1, status: 'bound'
  });
  expect(openDatabaseConnection().driver.queryOne(`SELECT source_locator, source_location,
    remote_provider, remote_document_id, remote_annotations_json FROM import_sources`)).toEqual({
    remote_annotations_json: '[{"kind":"highlight","nodeId":"highlight-topic","remoteId":"highlight-1"}]',
    remote_document_id: 'document-1', remote_provider: 'readwise',
    source_location: 'Sample.md', source_locator: '/historical/Sample.md'
  });
  expect(openDatabaseConnection().driver.queryOne(`SELECT content, anchor_link FROM nodes WHERE id='highlight-topic'`))
    .toEqual({ anchor_link: '{"origin":"imported"}', content: 'Exact highlight text.' });
});

it('keeps an edited old highlight unbound while reusing its parent Topic', async () => {
  openDatabaseConnection().driver.execute("UPDATE nodes SET updated_at='edited' WHERE id='highlight-topic'");
  const preview = await previewReadwiseIdentityBindings({ fetchImpl: identityFetch(), minIntervalMs: 0 });
  expect(preview).toMatchObject({ annotation_count: 0, candidate_count: 1, status: 'ready' });
  expect(confirmReadwiseIdentityBindingPreview(preview.preview_id!)).toMatchObject({ status: 'bound' });
  expect(openDatabaseConnection().driver.queryOne<{ remote_annotations_json: string }>(
    "SELECT remote_annotations_json FROM import_sources WHERE source_fingerprint='source-1'"
  )).toEqual({ remote_annotations_json: '[]' });
});

async function seedSource() {
  const fullRoot = path.join(tempRoot, 'Full Document Contents', 'Articles');
  const highlightRoot = path.join(tempRoot, 'Articles');
  await fs.mkdir(fullRoot, { recursive: true });
  await fs.mkdir(highlightRoot, { recursive: true });
  await fs.writeFile(path.join(fullRoot, 'Sample.md'), [
    '# Sample', '## Full Document', 'Exact highlight text.',
    'https://read.readwise.io/read/document-1'
  ].join('\n'));
  await fs.writeFile(path.join(highlightRoot, 'Sample.md'), [
    '# Sample', '## Highlights',
    'Exact highlight text. [...] (https://read.readwise.io/read/highlight-1)'
  ].join('\n'));
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,anchor_link,created_at,updated_at)
    VALUES ('topic-1',NULL,'topic','Sample',0,'Exact highlight text.',NULL,'old','old'),
      ('highlight-topic','topic-1','topic','Exact highlight text.',0,'Exact highlight text.',
       '{"origin":"imported"}','old','old')`);
  driver.execute(`INSERT INTO desktop_sources (source_ref,source_type,config_ref,host_name,host_platform,
    root_path,path_flavor,type_settings_json,created_at,updated_at) VALUES
    ('readwise:articles','readwise','articles','desktop-test','darwin',?,'posix',?,'old','old')`,
  [fullRoot, JSON.stringify({ highlightPath: highlightRoot })]);
  driver.execute(`INSERT INTO import_sources (source_fingerprint,provider,source_kind,source_name,source_locator,
    first_imported_at,last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location)
    VALUES ('source-1','desktop_text_file','markdown','Sample.md','/historical/Sample.md',
      'old','old','hash','topic-1','readwise:articles','Sample.md')`);
}

function identityFetch() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v2/export/') {
      return new Response(JSON.stringify({
        results: [{ external_id: 'document-1', source: 'reader', highlights: [{ external_id: 'highlight-1' }] }]
      }), { status: 200 });
    }
    const id = url.searchParams.get('id');
    const category = id === 'highlight-1' ? 'highlight' : 'article';
    const parent_id = id === 'highlight-1' ? 'document-1' : null;
    return new Response(JSON.stringify({ results: [{ category, id, parent_id }] }), { status: 200 });
  }) as typeof fetch;
}
