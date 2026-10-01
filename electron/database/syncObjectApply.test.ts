// @vitest-environment node

import { createHash } from 'node:crypto';
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
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';

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
    'SELECT COUNT(*) AS count FROM node_reading_host_state WHERE node_id = ?',
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

it('applies import source and external folder payloads', async () => {
  const records: NativeSyncObjectRecord[] = [{
    content_hash: 'hash-import-source',
    deleted_at: null,
    object_id: 'source-1',
    object_type: 'import_source',
    payload_json: JSON.stringify({
      first_imported_at: '2026-04-21T10:00:00.000Z',
      last_content_fingerprint: 'content-1',
      last_imported_at: '2026-04-21T16:00:00.000Z',
      provider: 'manual',
      source_kind: 'markdown',
      source_locator: '/docs/alpha.md',
      source_name: 'alpha.md'
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
      folder_path: '/docs',
      host_name: 'Desktop test host',
      host_platform: 'darwin',
      source_ref: 'external:folder-1',
      type_settings_json: '{}'
    }),
    updated_at: '2026-04-21T16:00:00.000Z'
  }];

  await expect(applySyncObjectsAsync(records)).resolves.toEqual(['import_source:source-1', 'external_folder:folder-1']);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ source_name: string }>('SELECT source_name FROM import_sources WHERE source_fingerprint = ?', ['source-1']))
    .toEqual({ source_name: 'alpha.md' });
  expect(driver.queryOne<{ folder_path: string }>('SELECT folder_path FROM external_search_folders WHERE id = ?', ['folder-1']))
    .toEqual({ folder_path: '/docs' });
});

it('ignores legacy attachment metadata without creating ownership or possession', async () => {
  const id = 'a'.repeat(64);
  const payload = { attachment_id: id, created_at: '2026-04-21T10:00:00.000Z',
    mime_type: 'image/png', original_name: 'cover.png', size_bytes: 12 };
  await expect(applySyncObjectsAsync([{ content_hash: 'hash-attachment', deleted_at: null,
    object_id: id, object_type: 'attachment', payload_json: JSON.stringify(payload),
    updated_at: '2026-04-21T16:00:00.000Z'
  }])).resolves.toEqual([]);
  const driver = openDatabaseConnection().driver;
  expect(driver.queryAll("SELECT name FROM sqlite_master WHERE name IN ('attachments', 'node_attachments', 'attachment_blobs')"))
    .toEqual([]);
  expect(driver.queryOne("SELECT object_id FROM sync_object_state WHERE object_type = 'attachment' AND object_id = ?", [id]))
    .toBeUndefined();
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

it('ignores legacy attachment tombstones without deleting node resources or derived PDF text', async () => {
  const driver = openDatabaseConnection().driver;
  const bytes = Buffer.from('%PDF-1.7\nPDF resource bytes\n%%EOF');
  const id = createHash('sha256').update(bytes).digest('hex');
  const assetsDir = path.join(tempRoot, 'assets');
  const resources = JSON.stringify([{ storage_key: `${id}.pdf`, original_name: 'paper.pdf', role: 'reference' }]);
  insertNode('pdf-topic');
  driver.execute(
    'UPDATE nodes SET resource_references = ? WHERE id = ?', [resources, 'pdf-topic']
  );
  expect(resolveAttachmentFile(`${id}.pdf`, assetsDir).status).toBe('missing_file');
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(path.join(assetsDir, `${id}.pdf`), bytes);
  expect(resolveAttachmentFile(`${id}.pdf`, assetsDir)).toMatchObject({ status: 'ready', bytes });
  driver.execute(
    `INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height)
     VALUES (?, ?, ?, ?, ?)`,
    [id, 1, 'Page one', 800, 1200]
  );

  await expect(applySyncObjectsAsync([{
    content_hash: 'hash-pdf-delete',
    deleted_at: '2026-04-21T17:00:00.000Z',
    object_id: id,
    object_type: 'attachment',
    payload_json: null,
    updated_at: '2026-04-21T17:00:00.000Z'
  }])).resolves.toEqual([]);

  expect(driver.queryOne('SELECT text FROM pdf_page_text WHERE attachment_id = ?', [id])).toEqual({ text: 'Page one' });
  expect(driver.queryOne('SELECT resource_references FROM nodes WHERE id = ?', ['pdf-topic']))
    .toEqual({ resource_references: resources });
  expect(resolveAttachmentFile(`${id}.pdf`, assetsDir)).toMatchObject({ status: 'ready', bytes });
});
