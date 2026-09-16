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
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'secret' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { runReadwiseSourceCutover } from './readwiseSourceCutover.js';
import { migrationFetch } from './readwiseSourceCutoverTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-restored-library-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
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

it('binds a restored legacy Topic by its unique category-scoped full title', async () => {
  seedUnreadableLegacyTopic();
  ensureReadwiseRemoteSource(false, '2026-09-16T00:00:00.000Z');
  const send = vi.fn();

  await expect(runReadwiseSourceCutover({
    dependencies: { fetchImpl: restoredLibraryFetch(), minIntervalMs: 0 },
    window: { isDestroyed: () => false, webContents: { send } }
  })).resolves.toMatchObject({ migrated_count: 1, status: 'completed' });

  const driver = openDatabaseConnection().driver;
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
