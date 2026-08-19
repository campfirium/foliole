// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-objects-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { writeImportSource } from '../../lib/core/database/importPipelineRecords.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import { withoutNodeViewStateHashSource } from '../../lib/platform/persistedNodeViewState.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { saveJsonSetting } from './settingsStore.js';
import { loadSyncObjects, loadSyncStateObjectsSince } from './syncObjects.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-objects-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  saveJsonSetting('device_id', 'desktop-test', '2026-08-12T00:00:00.000Z');
  saveJsonSetting('host_name', 'Desktop test host', '2026-08-12T00:00:00.000Z');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertSettingRecord() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO setting_records (
       key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['app_settings', 'user_space', 'windows', 'desktop', '*', '{"theme":"dark"}', 'hash-setting', '2026-04-21T16:20:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES (?, ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), ?, ?, ?, ?)`,
    ['setting', 'user_space:windows:desktop:*:app_settings', 'hash-setting', 'desktop', '2026-04-21T16:20:00.000Z', 1]
  );
}

function insertImportSourceRecord() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO import_sources (
       source_fingerprint, provider, source_kind, source_name, source_locator,
       first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['source-1', 'manual', 'markdown', 'alpha.md', '/docs/alpha.md', '2026-04-21T10:00:00.000Z',
      '2026-04-21T16:00:00.000Z', 'content-1', null]
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES (?, ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), ?, ?, ?, ?)`,
    ['import_source', 'source-1', 'hash-import-source', 'desktop', '2026-04-21T16:00:00.000Z', 1]
  );
}

function insertExternalFolderRecord() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO external_search_folders (
       id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json,
       status, document_count, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['folder-1', '/docs', 'document_relative_first_then_fixed_root', null, '[".git"]', 'ready', 2,
      '2026-04-21T10:00:00.000Z', '2026-04-21T16:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES (?, ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), ?, ?, ?, ?)`,
    ['external_folder', 'folder-1', 'hash-external-folder', 'desktop', '2026-04-21T16:00:00.000Z', 1]
  );
}

function insertExternalDocumentRecord() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO external_documents (
       document_id, folder_id, relative_path, file_name, extension, source_size_bytes,
       source_modified_at, source_modified_ms, content_hash, title, opening_text,
       content, indexed_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['doc-1', 'folder-1', 'alpha.md', 'alpha.md', 'md', 42, '2026-04-21T10:00:00.000Z',
      1, 'hash-doc-content', 'Alpha', 'Opening', 'Long external body',
      '2026-04-21T16:00:00.000Z', '2026-04-21T10:00:00.000Z', '2026-04-21T16:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES (?, ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), ?, ?, ?, ?)`,
    ['external_document', 'doc-1', 'hash-external-document', 'desktop', '2026-04-21T16:00:00.000Z', 1]
  );
}

function insertAttachmentRecord() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['att-1', 'cover.png', 'image/png', 12, '2026-04-21T10:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO attachment_blobs (
       attachment_id, content_hash, storage_key, size_bytes, mime_type,
       availability, source_host_name, created_at, cached_at, last_verified_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['att-1', 'sha256:att-1', 'sha256-att-1.png', 12, 'image/png',
      'local', 'desktop-1', '2026-04-21T10:00:00.000Z', '2026-04-21T10:00:00.000Z', '2026-04-21T10:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES (?, ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), ?, ?, ?, ?)`,
    ['attachment', 'att-1', 'hash-attachment', 'desktop', '2026-04-21T16:00:00.000Z', 1]
  );
}

function insertViewStateRecord() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO node_view_state (
       node_id, host_name, scroll_top, selection_from, selection_to, source, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['node-1', 'desktop-test', 128, null, null, 'close-flush', '2026-04-21T16:20:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES (?, ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), ?, ?, ?, ?)`,
    ['view_state', 'session_resume:windows:desktop:desktop-test:node:node-1',
      'hash-view-state', 'desktop-test', '2026-04-21T16:20:00.000Z', 1]
  );
}

it('loads generic sync object payloads from object state rows', () => {
  insertSettingRecord();

  expect(loadSyncObjects(['user_space:windows:desktop:*:app_settings'], ['setting'])).toEqual([
    expect.objectContaining({
      content_hash: 'hash-setting',
      deleted_at: null,
      object_id: 'user_space:windows:desktop:*:app_settings',
      object_type: 'setting',
      updated_at: '2026-04-21T16:20:00.000Z'
    })
  ]);
  const [settingRecord] = loadSyncObjects(['user_space:windows:desktop:*:app_settings']);
  expect(JSON.parse(settingRecord?.payload_json ?? '{}')).toMatchObject({
    key: 'app_settings',
    value_json: '{"theme":"dark"}'
  });
});

it('loads import source and external folder sync object payloads', () => {
  insertImportSourceRecord();
  insertExternalFolderRecord();

  const records = loadSyncObjects(['source-1', 'folder-1'], ['import_source', 'external_folder']);

  expect(records.map((record) => `${record.object_type}:${record.object_id}`)).toEqual([
    'external_folder:folder-1',
    'import_source:source-1'
  ]);
  expect(JSON.parse(records[1]?.payload_json ?? '{}')).toMatchObject({
    source_fingerprint: 'source-1',
    source_name: 'alpha.md'
  });
  expect(JSON.parse(records[0]?.payload_json ?? '{}')).toMatchObject({
    folder_path: '/docs',
    excluded_dirs_json: '[".git"]'
  });
});

it('loads attachment metadata and blob manifest sync payloads', () => {
  insertAttachmentRecord();

  const [record] = loadSyncObjects(['att-1'], ['attachment']);

  expect(record).toMatchObject({
    content_hash: 'hash-attachment',
    deleted_at: null,
    object_id: 'att-1',
    object_type: 'attachment'
  });
  expect(JSON.parse(record?.payload_json ?? '{}')).toMatchObject({
    attachment_id: 'att-1',
    original_name: 'cover.png',
    blob: {
      availability: 'local',
      cached_at: '2026-04-21T10:00:00.000Z',
      content_hash: 'sha256:att-1',
      last_verified_at: '2026-04-21T10:00:00.000Z',
      storage_key: 'sha256-att-1.png'
    }
  });
});

it('excludes pack-owned documents from JSON sync object streams', () => {
  insertExternalDocumentRecord();

  expect(loadSyncObjects(['doc-1'], ['external_document'])).toEqual([]);
  expect(loadSyncObjects(['doc-1'])).toEqual([]);
  expect(loadSyncStateObjectsSince(0)).toEqual([]);
});

it('exports view state source but excludes it from canonical content hash', () => {
  insertViewStateRecord();

  const [record] = loadSyncObjects(['session_resume:windows:desktop:desktop-test:node:node-1'], ['view_state']);
  const payload = JSON.parse(record?.payload_json ?? '{}') as Record<string, unknown>;

  expect(payload).toMatchObject({
    node_id: 'node-1',
    scroll_top: 128,
    selection_from: null,
    selection_to: null,
    source: 'close-flush'
  });
  expect(computeSyncContentHash('view_state', withoutNodeViewStateHashSource({
    host_name: 'Android test host',
    form_factor: 'phone',
    key: 'node:node-1',
    node_id: 'node-1',
    platform: 'android',
    scope: 'session_resume',
    scroll_top: 128,
    selection_from: null,
    selection_to: null,
    source: 'user-scroll'
  }))).toBe('d6cb842e751d098aa5a5fed7334b31f876008bf79742e5b0fb441fd008e708fb');
});

it('records import sources as sync objects when written', () => {
  const record: PersistedImportRecord = {
    contentFingerprint: 'content-1',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-1',
    importedAt: '2026-04-21T16:00:00.000Z',
    nodeId: 'node-1',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-1',
    sourceKind: 'markdown',
    sourceLocator: '/docs/alpha.md',
    sourceName: 'alpha.md'
  };

  writeImportSource(openDatabaseConnection().driver, record);

  expect(loadSyncObjects(['source-1'], ['import_source'])).toHaveLength(1);
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM sync_change_log WHERE object_type = 'import_source' AND object_id = 'source-1'`
  )).toEqual({ count: 0 });
});
