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

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-external-reference-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function prepareV81() {
  const connection = openDatabaseConnection();
  connection.sqlite.exec('ALTER TABLE external_documents DROP COLUMN reference_json');
  connection.sqlite.exec('ALTER TABLE external_documents DROP COLUMN reference_kind');
  connection.sqlite.pragma('user_version = 81');
  return connection;
}

it('adds explicit External reference columns while preserving local-path defaults', () => {
  const connection = prepareV81();
  initializeDatabaseSchema(connection.sqlite);
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(82);
  expect(connection.sqlite.prepare("SELECT name FROM pragma_table_info('external_documents') WHERE name='reference_kind'").get())
    .toEqual({ name: 'reference_kind' });
  connection.sqlite.prepare(`INSERT INTO external_documents (
    document_id, folder_id, relative_path, file_name, extension, source_size_bytes, source_modified_at,
    source_modified_ms, content_hash, title, content, indexed_at, created_at, updated_at
  ) VALUES ('doc', 'folder', 'doc.md', 'doc.md', 'md', 0, 'now', 0, 'hash', 'Doc', '', 'now', 'now', 'now')`).run();
  expect(connection.sqlite.prepare(
    "SELECT reference_kind, reference_json FROM external_documents WHERE document_id='doc'"
  ).get()).toEqual({ reference_json: null, reference_kind: 'local_path' });
});

it('rolls back both reference columns when the v82 commit fails', () => {
  const connection = prepareV81();
  expect(() => initializeDatabaseSchema(connection.sqlite, {
    beforeVersionCommit: () => { throw new Error('injected reference migration failure'); }
  })).toThrow('injected reference migration failure');
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(81);
  expect(connection.sqlite.prepare(
    "SELECT name FROM pragma_table_info('external_documents') WHERE name IN ('reference_kind','reference_json')"
  ).all()).toEqual([]);
});
