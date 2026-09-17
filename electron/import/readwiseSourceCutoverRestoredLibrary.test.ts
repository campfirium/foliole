// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
const state = vi.hoisted(() => ({ connectionReady: true }));

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
  const { createDefaultReadwiseReaderConfig } = await import('../../lib/core/import/readwiseReaderSettings.js');
  return {
    isStoredReadwiseApiConnectionReady: () => state.connectionReady,
    loadStoredReadwiseHostSettings: () => ({
      apiConnection: { secretRef: 'readwise-secret', state: 'connected' },
      readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
      readwiseSourceMode: 'folder'
    })
  };
});
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'secret' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { runReadwiseSourceCutover } from './readwiseSourceCutover.js';
import { migrationFetch } from './readwiseSourceCutoverTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-restored-library-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  state.connectionReady = true;
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
  openDatabaseConnection().driver.execute(
    "INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('readwise_source_mode','{\"mode\":\"relay\",\"version\":1}','old')"
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('uses the current device token to initialize and migrate a restored legacy library', async () => {
  seedUnreadableLegacyTopic();
  const send = vi.fn();

  await expect(runReadwiseSourceCutover({
    dependencies: { fetchImpl: restoredLibraryFetch(), minIntervalMs: 0 },
    window: { isDestroyed: () => false, webContents: { send } }
  })).resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  const driver = openDatabaseConnection().driver;
  expect(loadReadwiseRemoteSource()?.connectionRef).toMatch(/^readwise-/u);
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id='legacy-topic'")?.content)
    .toBe('Legacy body stays untouched.');
  expect(driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id='document-1'"
  )?.latest_node_id).toBe('legacy-topic');
  expect(send.mock.calls.map(([, payload]) => payload)).toContainEqual(expect.objectContaining({
    phase: 'indexing', processedCount: 3, totalCount: 3
  }));
  expect(send.mock.calls.map(([, payload]) => payload)).toContainEqual(expect.objectContaining({
    phase: 'merging', processedCount: 1, totalCount: 1
  }));
});

it('rebuilds a cached legacy EPUB in place when its old source folder is unavailable', async () => {
  seedUnreadableLegacyEpub();

  await expect(runReadwiseSourceCutover({
    dependencies: { fetchImpl: restoredEpubFetch(), minIntervalMs: 0 }
  })).resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id='epub-1'"
  )).toEqual({ latest_node_id: 'legacy-book' });
  const source = driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id='epub-1'"
  );
  expect(JSON.parse(source?.remote_import_state_json ?? '{}')).toMatchObject({
    bodyAuthority: 'reader_html', metadata: { category: 'epub' }
  });
  expect(driver.queryAll<{ title: string }>(
    "SELECT title FROM nodes WHERE parent_id='legacy-book' AND deleted_at IS NULL ORDER BY title"
  ).map((item) => item.title)).toEqual(['Chapter 1']);
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM nodes WHERE title='Cached Book' AND deleted_at IS NULL"
  )).toEqual({ count: 1 });
});

it('does not initialize a restored library without a usable device token', async () => {
  state.connectionReady = false;

  await expect(runReadwiseSourceCutover()).resolves.toMatchObject({
    error_reason: 'readwise_api_reconnect_required', status: 'connection_required'
  });

  expect(loadReadwiseRemoteSource()).toBeNull();
});

function seedUnreadableLegacyTopic() {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('legacy-topic',NULL,'topic','Sample',0,'Legacy body stays untouched.','old','old')`);
  driver.execute(`INSERT INTO desktop_sources (source_ref,source_type,config_ref,host_name,host_platform,
    root_path,path_flavor,type_settings_json,created_at,updated_at) VALUES
    ('readwise:restored','readwise','restored','This Mac','win32','D:\\Missing','windows',
     '{"highlightPath":"D:\\\\Missing","keepState":"enabled","kind":"articles"}','old','old')`);
  driver.execute(`INSERT INTO import_sources (source_fingerprint,provider,source_kind,source_name,source_locator,
    first_imported_at,last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location) VALUES
    ('legacy-source','desktop_text_file','markdown','Sample.md','D:\\Missing\\Sample.md','old','old','hash',
     'legacy-topic','readwise:restored','Sample.md')`);
  driver.execute(`INSERT INTO keep_import_items (
    rule_id,source_path,source_mtime_ms,source_size_bytes,source_state,local_node_state,
    has_source_update,last_node_id,last_status,first_seen_at,last_seen_at,last_imported_at
  ) VALUES ('restored','Sample.md',1,1,'present','active',0,'legacy-topic','imported','old','old','old')`);
  driver.execute(`INSERT INTO keep_import_item_cache (
    rule_id,source_path,title,content,source_mtime_ms,source_size_bytes,refreshed_at
  ) VALUES ('restored','Sample.md','Sample',
    '[View in Reader](https://read.readwise.io/read/document-1)',1,1,'old')`);
}

function seedUnreadableLegacyEpub() {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('legacy-book',NULL,'topic','Cached Book',0,'Original file missing','old','old')`);
  driver.execute(`INSERT INTO desktop_sources (source_ref,source_type,config_ref,host_name,host_platform,
    root_path,path_flavor,type_settings_json,created_at,updated_at) VALUES
    ('readwise:books','readwise','books','This Mac','win32','D:\\Missing','windows',
     '{"highlightPath":"D:\\\\Missing","keepState":"enabled","kind":"books"}','old','old')`);
  driver.execute(`INSERT INTO import_sources (source_fingerprint,provider,source_kind,source_name,source_locator,
    first_imported_at,last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location) VALUES
    ('book-source','desktop_text_file','markdown','Cached Book.md','D:\\Missing\\Cached Book.md','old','old','hash',
     'legacy-book','readwise:books','Cached Book.md')`);
  driver.execute(`INSERT INTO keep_import_items (
    rule_id,source_path,source_mtime_ms,source_size_bytes,source_state,local_node_state,
    has_source_update,last_node_id,last_status,first_seen_at,last_seen_at,last_imported_at
  ) VALUES ('books','Cached Book.md',1,1,'present','active',0,'legacy-book','imported','old','old','old')`);
  driver.execute(`INSERT INTO keep_import_item_cache (
    rule_id,source_path,title,content,source_mtime_ms,source_size_bytes,refreshed_at
  ) VALUES ('books','Cached Book.md','Cached Book',
    '[Download original file](https://readwise.io/reader/document_raw_content/33661889)',1,1,'old')`);
}

function restoredLibraryFetch() {
  const fallback = migrationFetch();
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v3/list/' && !url.searchParams.has('id')) {
      return Response.json({ count: 2, nextPageCursor: null, results: [
        { category: 'article', html_content: '<p>Fresh API body.</p>', id: 'document-1', title: 'Sample' },
        { category: 'highlight', id: 'highlight-1', parent_id: 'document-1' }
      ] });
    }
    return fallback(input);
  }) as typeof fetch;
}

function restoredEpubFetch() {
  const document = {
    category: 'epub',
    html_content: '<h1 data-rw-epub-toc="chapter-1">Chapter 1</h1><p>Fresh book body.</p>',
    id: 'epub-1',
    raw_source_url: 'https://readwise-assets.s3.amazonaws.com/ParsedDocument33661889.epub',
    title: 'Cached Book'
  };
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v2/export/') {
      return Response.json({ count: 1, nextPageCursor: null, results: [{
        external_id: 'epub-1', highlights: [], source: 'reader'
      }] });
    }
    if (url.pathname === '/api/v3/list/') {
      const id = url.searchParams.get('id');
      const category = url.searchParams.get('category');
      const results = id === 'epub-1' || !category || category === 'epub' ? [document] : [];
      return Response.json({ count: results.length, nextPageCursor: null, results });
    }
    throw new Error(`unexpected_request:${url}`);
  }) as typeof fetch;
}
