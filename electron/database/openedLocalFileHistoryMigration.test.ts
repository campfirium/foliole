// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-opened-local-file-history-migration';

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

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-opened-local-history-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function countRows(table: string, where = '1 = 1') {
  return (openDatabaseConnection().sqlite
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`)
    .get() as { count: number }).count;
}

it('resets opened-file history while preserving regular external libraries', async () => {
  const connection = initializeDatabaseConnection(openDatabaseConnection());
  connection.sqlite.pragma('user_version = 47');
  connection.sqlite.exec(`
    INSERT INTO local_files (
      id, absolute_path, title, file_size, modified_at, last_opened_at, missing_at,
      cursor_from, cursor_to, created_at, updated_at
    ) VALUES (
      'local-1', '${path.join(tempRoot, 'note.md').replace(/'/g, "''")}', 'note.md', 12,
      '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z', NULL,
      NULL, NULL, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'
    );
  `);
  insertExternalFolder('opened-external-documents', 'Local');
  insertExternalFolder('folder-1', '/library');
  insertExternalDocument('opened-doc', 'opened-external-documents', 'opened.md');
  insertExternalDocument('regular-doc', 'folder-1', 'regular.md');
  insertSyncRows('opened-external-documents', 'external_folder');
  insertSyncRows('opened-doc', 'external_document');
  insertSyncRows('regular-doc', 'external_document');

  initializeDatabaseConnection(connection);

  expect(countRows('local_files')).toBe(0);
  expect(countRows('external_search_folders', "id = 'opened-external-documents'")).toBe(0);
  expect(countRows('external_documents', "folder_id = 'opened-external-documents'")).toBe(0);
  expect(countRows('external_search_folders', "id = 'folder-1'")).toBe(1);
  expect(countRows('external_documents', "folder_id = 'folder-1'")).toBe(1);
  expect(countRows('sync_object_state', "object_id IN ('opened-external-documents', 'opened-doc')")).toBe(0);
  expect(countRows('sync_change_log', "object_id IN ('opened-external-documents', 'opened-doc')")).toBe(0);
  expect(countRows('sync_object_state', "object_id = 'regular-doc'")).toBe(1);
});

function insertExternalFolder(id: string, folderPath: string) {
  openDatabaseConnection().sqlite.prepare(`INSERT INTO external_search_folders (
    id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json,
    status, document_count, indexed_at, last_error, created_at, updated_at
  ) VALUES (?, ?, 'document_relative_first_then_fixed_root', NULL, '[]', 'ready', 1, ?, NULL, ?, ?)`)
    .run(id, folderPath, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z');
}

function insertExternalDocument(documentId: string, folderId: string, relativePath: string) {
  openDatabaseConnection().sqlite.prepare(`INSERT INTO external_documents (
    document_id, folder_id, relative_path, file_name, extension, source_size_bytes,
    source_modified_at, source_modified_ms, content_hash, title, opening_text,
    body_blob_hash, content, indexed_at, is_present, missing_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'md', 12, ?, 1781136000000, ?, ?, 'Body', NULL, 'Body', ?, 1, NULL, ?, ?)`)
    .run(
      documentId,
      folderId,
      relativePath,
      path.basename(relativePath),
      '2026-06-11T00:00:00.000Z',
      `hash-${documentId}`,
      path.basename(relativePath, '.md'),
      '2026-06-11T00:00:00.000Z',
      '2026-06-11T00:00:00.000Z',
      '2026-06-11T00:00:00.000Z'
    );
}

function insertSyncRows(objectId: string, objectType: string) {
  openDatabaseConnection().sqlite.prepare(`INSERT INTO sync_object_state (
    object_type, object_id, state_seq, current_version_id, content_hash,
    last_modified_by_device_id, updated_at, deleted_at, sync_dirty
  ) VALUES (?, ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), NULL, ?, 'desktop', ?, NULL, 0)`)
    .run(objectType, objectId, `hash-${objectId}`, '2026-06-11T00:00:00.000Z');
  openDatabaseConnection().sqlite.prepare(`INSERT INTO sync_change_log (
    change_id, object_type, object_id, change_type, device_id, base_version_id,
    result_version_id, content_hash, payload_json, created_at, applied_at
  ) VALUES (?, ?, ?, 'upsert', 'desktop', NULL, NULL, ?, '{}', ?, ?)`)
    .run(`change-${objectId}`, objectType, objectId, `hash-${objectId}`, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z');
}
