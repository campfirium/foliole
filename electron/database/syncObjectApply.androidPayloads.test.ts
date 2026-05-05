// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-android-payload-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjects } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-android-payload-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(nodeId: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES (?, 'item', ?, '', ?, ?)`,
    [nodeId, nodeId, '2026-04-25T08:00:00.000Z', '2026-04-25T08:00:00.000Z']
  );
}

function insertAttachment(attachmentId: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [attachmentId, 'sample.pdf', 'application/pdf', 12, '2026-04-25T08:00:00.000Z']
  );
}

it('accepts Android-exported numeric strings when applying learning objects', () => {
  insertNode('node-1');

  applySyncObjects([{
    content_hash: 'hash-reading',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: JSON.stringify({
      interval_duration_ms: '2500',
      interval_growth_factor: '1.75',
      last_handled_at: '2026-04-25T08:00:00.000Z',
      next_at: '2026-04-25T09:00:00.000Z',
      priority: '3',
      reading_position: '42',
      repetition_count: '5',
      state: 'active'
    }),
    updated_at: '2026-04-25T08:05:00.000Z'
  }]);

  expect(openDatabaseConnection().driver.queryOne<{
    interval_duration_ms: number;
    interval_growth_factor: number;
    reading_position: number;
  }>('SELECT interval_duration_ms, interval_growth_factor, reading_position FROM node_reading WHERE node_id = ?', ['node-1']))
    .toEqual({ interval_duration_ms: 2500, interval_growth_factor: 1.75, reading_position: 42 });
});

it('accepts Android-exported numeric strings when applying pdf page text', () => {
  insertAttachment('attachment-1');

  applySyncObjects([{
    content_hash: 'hash-pdf-page',
    deleted_at: null,
    object_id: 'attachment-1:3',
    object_type: 'pdf_page_text',
    payload_json: JSON.stringify({
      attachment_id: 'attachment-1',
      page: '3',
      page_height: '1200.5',
      page_width: '800.25',
      text: 'page text'
    }),
    updated_at: '2026-04-25T08:05:00.000Z'
  }]);

  expect(openDatabaseConnection().driver.queryOne<{ page: number; page_height: number; page_width: number }>(
    'SELECT page, page_height, page_width FROM pdf_page_text WHERE attachment_id = ?',
    ['attachment-1']
  )).toEqual({ page: 3, page_height: 1200.5, page_width: 800.25 });
});

it('accepts Android-exported numeric strings when applying external documents', () => {
  applySyncObjects([{
    content_hash: 'hash-document',
    deleted_at: null,
    object_id: 'document-1',
    object_type: 'external_document',
    payload_json: JSON.stringify({
      content: 'body',
      extension: '.md',
      file_name: 'doc.md',
      folder_id: 'folder-1',
      is_present: '0',
      relative_path: 'doc.md',
      source_modified_ms: '1777',
      source_size_bytes: '88'
    }),
    updated_at: '2026-04-25T08:05:00.000Z'
  }]);

  expect(openDatabaseConnection().driver.queryOne<{
    is_present: number;
    source_modified_ms: number;
    source_size_bytes: number;
  }>('SELECT is_present, source_modified_ms, source_size_bytes FROM external_documents WHERE document_id = ?', ['document-1']))
    .toEqual({ is_present: 0, source_modified_ms: 1777, source_size_bytes: 88 });
});
