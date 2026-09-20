// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
const state = vi.hoisted(() => ({ sourcePath: '' }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
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
      apiConnection: { secretRef: 'test-secret', state: 'connected' },
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
      highlightMode: 'split', highlightPath: state.sourcePath, id: 'local',
      keepState: 'enabled', kind: 'books', primaryPath: state.sourcePath
    }]
  }) };
});
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'test-secret' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { runReadwiseSourceCutover } from './readwiseSourceCutover.js';
import { epubMigrationFetch } from './readwiseSourceCutoverTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-deleted-readwise-'));
  appDataDir = path.join(tempRoot, 'app-data');
  state.sourcePath = path.join(tempRoot, 'Readwise');
  await fs.mkdir(state.sourcePath, { recursive: true });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
  openDatabaseConnection().driver.execute(
    "INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('readwise_source_mode','{\"mode\":\"relay\",\"version\":1}','old')"
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('does not resurrect a permanently deleted book whose cached source has a stable Reader identity', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO desktop_sources (
    source_ref,source_type,config_ref,host_name,host_platform,root_path,path_flavor,
    type_settings_json,created_at,updated_at
  ) VALUES ('readwise:local','readwise','local','This Mac',?,?,?,?, 'old','old')`, [
    process.platform, state.sourcePath, process.platform === 'win32' ? 'windows' : 'posix',
    JSON.stringify({ highlightPath: state.sourcePath, keepState: 'enabled', kind: 'books' })
  ]);
  driver.execute(`INSERT INTO keep_import_items (
    rule_id,source_path,source_mtime_ms,source_size_bytes,source_state,local_node_state,
    has_source_update,last_node_id,last_status,first_seen_at,last_seen_at,last_imported_at
  ) VALUES ('local','Sample.md',1,1,'present','locally_deleted',0,'deleted-book',
    'blocked_deleted','old','old','old')`);
  driver.execute(`INSERT INTO keep_import_item_cache (
    rule_id,source_path,title,content,source_mtime_ms,source_size_bytes,refreshed_at
  ) VALUES ('local','Sample.md','Sample',?,1,1,'old')`, [
    '[Download original file](https://readwise.io/reader/document_raw_content/33661889)'
  ]);
  driver.execute(`INSERT INTO source_disposition_states (
    source_kind,source_scope,original_title,disposition,updated_at
  ) VALUES ('readwise','local:.','Sample','hard_deleted','old')`);
  const remote = ensureReadwiseRemoteSource(false, '2026-09-08T00:00:00.000Z');

  await expect(runReadwiseSourceCutover({
    dependencies: { fetchImpl: epubMigrationFetch(), minIntervalMs: 0 }
  })).resolves.toMatchObject({ migrated_count: 0, status: 'completed' });

  const journal = JSON.parse(driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'"
  )?.value ?? '{}');
  expect(journal.documents).toContainEqual({ nodeId: null, remoteId: 'document-1', status: 'suppressed' });
  expect(driver.queryOne(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id='document-1'"
  )).toBeUndefined();
  expect(driver.queryOne<{ disposition: string }>(
    'SELECT disposition FROM source_disposition_states WHERE source_kind=? AND source_scope=?',
    ['readwise', `api/${remote.connectionRef}/document-1`]
  )).toEqual({ disposition: 'hard_deleted' });
});
