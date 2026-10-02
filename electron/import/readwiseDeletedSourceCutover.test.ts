// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
const state = vi.hoisted(() => ({ sourcePath: '', importArticles: false }));

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
    readwiseAutoImportPolicy: { ...createDefaultReadwiseAutoImportPolicy(),
      ...(state.importArticles ? { articleWithoutHighlights: 'inbox' } : {}) },
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
import { readReadwiseApiSourceDisposition, writeReadwiseApiSourceDisposition } from '../database/readwiseApiSourceDispositions.js';
import { listReadwiseLegacySourceDispositions } from '../database/readwiseLegacySourceDispositions.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { runReadwiseSourceCutover } from './readwiseSourceCutover.js';
import { epubMigrationFetch } from './readwiseSourceCutoverTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  state.importArticles = false;
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

it.each([
  ['ChatGPT', false], ['  ChatGPT  ', false], ['x'.repeat(19), false],
  ['x'.repeat(20), true], ['中'.repeat(19), false], ['中'.repeat(20), true],
  ['😀'.repeat(19), false], ['😀'.repeat(20), true]
] as const)('uses trimmed character length for legacy title matching: %s', (title, matches) => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO keep_import_items (
    rule_id,source_path,source_mtime_ms,source_size_bytes,source_state,local_node_state,
    has_source_update,last_node_id,last_status,first_seen_at,last_seen_at,last_imported_at
  ) VALUES ('local','Sample.md',1,1,'present','locally_deleted',0,'deleted-book',
    'blocked_deleted','old','old','old')`);
  driver.execute(`INSERT INTO keep_import_item_cache (
    rule_id,source_path,title,source_mtime_ms,source_size_bytes,refreshed_at
  ) VALUES ('local','Sample.md',?,1,1,'old')`, [title]);
  driver.execute('INSERT INTO source_disposition_states VALUES (?,?,?,?,?)',
    ['readwise', 'local:.', title.trim(), 'hard_deleted', 'old']);
  expect(listReadwiseLegacySourceDispositions(driver)).toHaveLength(matches ? 1 : 0);
  expect(driver.queryAll('SELECT disposition FROM source_disposition_states'))
    .toEqual([{ disposition: 'hard_deleted' }]);
});

it('retains exact API deletion state even when the document title is short', () => {
  const driver = openDatabaseConnection().driver;
  writeReadwiseApiSourceDisposition(driver, 'connection', 'document-1', 'ChatGPT', 'hard_deleted', 'old');
  expect(readReadwiseApiSourceDisposition(driver, 'connection', 'document-1')).toBe('hard_deleted');
});

function seedChatGptSources() {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO desktop_sources (
    source_ref,source_type,config_ref,host_name,host_platform,root_path,path_flavor,
    type_settings_json,created_at,updated_at
  ) VALUES ('readwise:local','readwise','local','This Mac',?,?,?,?, 'old','old')`, [
    process.platform, state.sourcePath, 'posix', JSON.stringify({ kind: 'articles' })
  ]);
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('kept-node',NULL,'topic','ChatGPT',0,'Kept existing content','old','old')`);
  for (const id of ['a', 'b', 'c']) {
    driver.execute(`INSERT INTO keep_import_items (
      rule_id,source_path,source_mtime_ms,source_size_bytes,source_state,local_node_state,
      has_source_update,last_node_id,last_status,first_seen_at,last_seen_at,last_imported_at
    ) VALUES ('local',?,1,1,'present',?,0,?,'imported','old','old','old')`,
    [`${id}.md`, id === 'a' ? 'active' : 'locally_deleted', id === 'a' ? 'kept-node' : `deleted-${id}`]);
    driver.execute(`INSERT INTO keep_import_item_cache (
      rule_id,source_path,title,content,source_mtime_ms,source_size_bytes,refreshed_at
    ) VALUES ('local',?,'ChatGPT',?,1,1,'old')`, [`${id}.md`, `https://read.readwise.io/read/document-${id}`]);
  }
  driver.execute("INSERT INTO source_disposition_states VALUES ('readwise','local:.','ChatGPT','hard_deleted','old')");
}

it.each([false, true])('continues migration past same-title short deletion records (reopen=%s)', async (reopen) => {
  state.importArticles = true;
  seedChatGptSources();
  if (reopen) {
    closeDatabaseConnection();
    initializeDatabaseConnection(openDatabaseConnection());
  }
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const ids = ['document-a', 'document-b', 'document-c'].filter((id) =>
      !url.searchParams.has('id') || url.searchParams.get('id') === id);
    return Response.json({ nextPageCursor: null, results: url.pathname === '/api/v2/export/' ? [] :
      ids.map((id) => ({ id, category: 'article', title: 'ChatGPT', parent_id: null,
        html_content: '<p>Independent document body.</p>' })) });
  });
  await expect(runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } }))
    .resolves.toMatchObject({ status: 'completed' });
  const driver = openDatabaseConnection().driver;
  expect(driver.queryAll('SELECT source_scope,disposition FROM source_disposition_states'))
    .toEqual([{ source_scope: 'local:.', disposition: 'hard_deleted' }]);
  expect(driver.queryOne("SELECT deleted_at FROM nodes WHERE id='kept-node'"))
    .toEqual({ deleted_at: null });
  expect(driver.queryOne<{ count: number }>(
    "SELECT count(*) count FROM import_sources WHERE remote_provider='readwise'")?.count).toBe(3);
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
  ) VALUES ('local','Sample.md','Sample Reader document title',?,1,1,'old')`, [
    '[Download original file](https://readwise.io/reader/document_raw_content/33661889)'
  ]);
  driver.execute(`INSERT INTO source_disposition_states (
    source_kind,source_scope,original_title,disposition,updated_at
  ) VALUES ('readwise','local:.','Sample Reader document title','hard_deleted','old')`);
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
