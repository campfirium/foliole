// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-object-apply-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-apply-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(nodeId: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES (?, 'item', ?, '', ?, ?)`,
    [nodeId, nodeId, '2026-04-21T10:00:00.000Z', '2026-04-21T10:00:00.000Z']
  );
}

it('applies generic sync object payloads and marks them clean', async () => {
  insertNode('node-1');
  const records: NativeSyncObjectRecord[] = [{
    content_hash: 'hash-setting',
    deleted_at: null,
    object_id: 'user_space:windows:desktop:*:app_settings',
    object_type: 'setting',
    payload_json: JSON.stringify({
      device_id: '*',
      form_factor: 'desktop',
      key: 'app_settings',
      platform: 'windows',
      scope: 'user_space',
      value_json: '{"theme":"dark"}'
    }),
    updated_at: '2026-04-21T16:20:00.000Z'
  }, {
    content_hash: 'hash-reading',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: JSON.stringify({
      interval_duration_ms: 1000,
      interval_growth_factor: 1.5,
      last_handled_at: '2026-04-21T16:00:00.000Z',
      next_at: '2026-04-22T16:00:00.000Z',
      priority: 2,
      reading_position: 7,
      repetition_count: 3,
      state: 'active'
    }),
    updated_at: '2026-04-21T16:21:00.000Z'
  }];

  await expect(applySyncObjectsAsync(records)).resolves.toEqual([
    'setting:user_space:windows:desktop:*:app_settings',
    'node_reading:node-1'
  ]);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ value_json: string }>('SELECT value_json FROM setting_records WHERE key = ?', ['app_settings']))
    .toEqual({ value_json: '{"theme":"dark"}' });
  expect(driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM node_reading_device_state WHERE node_id = ?',
    ['node-1']
  )).toEqual({ count: 0 });
  expect(driver.queryOne<{ sync_dirty: number }>(
    `SELECT sync_dirty FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'node-1'`
  )).toEqual({ sync_dirty: 0 });
});

it('applies generic sync object payloads through the shared async executor', async () => {
  const record: NativeSyncObjectRecord = {
    content_hash: 'hash-setting-async',
    deleted_at: null,
    object_id: 'user_space:windows:desktop:*:async_settings',
    object_type: 'setting',
    payload_json: JSON.stringify({
      key: 'async_settings',
      scope: 'user_space',
      value_json: '{"mode":"async"}'
    }),
    updated_at: '2026-04-21T16:22:00.000Z'
  };

  await expect(applySyncObjectsAsync([record])).resolves.toEqual([
    'setting:user_space:windows:desktop:*:async_settings'
  ]);

  expect(openDatabaseConnection().driver.queryOne<{ value_json: string }>(
    'SELECT value_json FROM setting_records WHERE key = ?',
    ['async_settings']
  )).toEqual({ value_json: '{"mode":"async"}' });
});

it('applies document source and external folder payloads', async () => {
  const records: NativeSyncObjectRecord[] = [{
    content_hash: 'hash-document-source',
    deleted_at: null,
    object_id: 'source-1',
    object_type: 'document_source',
    payload_json: JSON.stringify({
      availability_state: 'available',
      content_fingerprint: 'content-1',
      first_seen_at: '2026-04-21T10:00:00.000Z',
      last_seen_at: '2026-04-21T16:00:00.000Z',
      presentation_state: 'external',
      provider: 'manual',
      provider_document_id: 'source-1',
      source_fingerprint: 'source-1',
      source_kind: 'markdown',
      source_locator: '/docs/alpha.md',
      source_name: 'alpha.md',
      sync_status: 'synced'
    }),
    updated_at: '2026-04-21T16:00:00.000Z'
  }, {
    content_hash: 'hash-external-folder',
    deleted_at: null,
    object_id: 'folder-1',
    object_type: 'external_folder',
    payload_json: JSON.stringify({
      attachment_mode: 'document_relative_first_then_fixed_root',
      excluded_dirs_json: '[".git"]',
      folder_path: '/docs'
    }),
    updated_at: '2026-04-21T16:00:00.000Z'
  }];

  await expect(applySyncObjectsAsync(records)).resolves.toEqual(['document_source:source-1', 'external_folder:folder-1']);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ source_name: string }>('SELECT source_name FROM document_sources WHERE source_id = ?', ['source-1']))
    .toEqual({ source_name: 'alpha.md' });
  expect(driver.queryOne<{ folder_path: string }>('SELECT folder_path FROM external_search_folders WHERE id = ?', ['folder-1']))
    .toEqual({ folder_path: '/docs' });
});

it('applies attachment metadata and blob manifests', async () => {
  const records: NativeSyncObjectRecord[] = [{
    content_hash: 'hash-attachment',
    deleted_at: null,
    object_id: 'att-1',
    object_type: 'attachment',
    payload_json: JSON.stringify({
      created_at: '2026-04-21T10:00:00.000Z',
      mime_type: 'image/png',
      original_name: 'cover.png',
      size_bytes: 12,
      blob: {
        availability: 'remote_known',
        cached_at: '2026-04-21T11:00:00.000Z',
        content_hash: 'sha256:att-1',
        created_at: '2026-04-21T10:00:00.000Z',
        last_verified_at: '2026-04-21T12:00:00.000Z',
        mime_type: 'image/png',
        size_bytes: 12,
        storage_key: 'sha256-att-1.png'
      }
    }),
    updated_at: '2026-04-21T16:00:00.000Z'
  }];

  await expect(applySyncObjectsAsync(records)).resolves.toEqual(['attachment:att-1']);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ original_name: string }>('SELECT original_name FROM attachments WHERE id = ?', ['att-1']))
    .toEqual({ original_name: 'cover.png' });
  expect(driver.queryOne<{
    availability: string;
    cached_at: string;
    content_hash: string;
    last_verified_at: string;
  }>(
    'SELECT availability, cached_at, content_hash, last_verified_at FROM attachment_blobs WHERE attachment_id = ?',
    ['att-1']
  )).toEqual({
    availability: 'remote_known',
    cached_at: '2026-04-21T11:00:00.000Z',
    content_hash: 'sha256:att-1',
    last_verified_at: '2026-04-21T12:00:00.000Z'
  });
});

it('applies tombstones to payload table and sync object state', async () => {
  insertNode('node-1');
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO node_reading (node_id, last_handled_at, next_at) VALUES (?, ?, ?)`,
    ['node-1', '2026-04-21T10:00:00.000Z', '2026-04-22T10:00:00.000Z']
  );

  await applySyncObjectsAsync([{
    content_hash: 'hash-reading-delete',
    deleted_at: '2026-04-21T17:00:00.000Z',
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: null,
    updated_at: '2026-04-21T17:00:00.000Z'
  }]);

  expect(driver.queryOne('SELECT node_id FROM node_reading WHERE node_id = ?', ['node-1'])).toBeUndefined();
  expect(driver.queryOne<{ deleted_at: string }>(
    `SELECT deleted_at FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'node-1'`
  )).toEqual({ deleted_at: '2026-04-21T17:00:00.000Z' });
});

it('clears derived PDF text when applying an attachment tombstone', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['pdf-1', 'paper.pdf', 'application/pdf', 100, '2026-04-21T10:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height)
     VALUES (?, ?, ?, ?, ?)`,
    ['pdf-1', 1, 'Page one', 800, 1200]
  );

  await applySyncObjectsAsync([{
    content_hash: 'hash-pdf-delete',
    deleted_at: '2026-04-21T17:00:00.000Z',
    object_id: 'pdf-1',
    object_type: 'attachment',
    payload_json: null,
    updated_at: '2026-04-21T17:00:00.000Z'
  }]);

  expect(driver.queryOne('SELECT attachment_id FROM pdf_page_text WHERE attachment_id = ?', ['pdf-1'])).toBeUndefined();
});
