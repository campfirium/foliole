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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-identity-migration-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function prepareV79() {
  const connection = openDatabaseConnection();
  connection.sqlite.exec('DROP INDEX idx_import_sources_readwise_remote_document');
  connection.sqlite.exec('DROP INDEX idx_import_sources_readwise_remote_topic');
  for (const column of ['remote_annotations_json', 'remote_document_id', 'remote_connection_ref', 'remote_provider']) {
    connection.sqlite.exec(`ALTER TABLE import_sources DROP COLUMN ${column}`);
  }
  connection.sqlite.pragma('user_version = 79');
  return connection;
}

it('adds remote identity columns and uniqueness without rewriting historical paths', () => {
  const connection = prepareV79();
  connection.sqlite.exec(`INSERT INTO import_sources
    (source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at,
      last_imported_at, last_content_fingerprint, latest_node_id, source_ref, source_location)
    VALUES ('one','desktop_text_file','markdown','One','/old/one','old','old','hash','topic-1','readwise:a','One.md'),
      ('two','desktop_text_file','markdown','Two','/old/two','old','old','hash','topic-2','readwise:a','Two.md')`);

  initializeDatabaseSchema(connection.sqlite);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(80);
  expect(connection.sqlite.prepare(`SELECT source_locator, source_location, remote_annotations_json
    FROM import_sources WHERE source_fingerprint = 'one'`).get()).toEqual({
    remote_annotations_json: '[]', source_location: 'One.md', source_locator: '/old/one'
  });
  connection.sqlite.exec(`UPDATE import_sources SET remote_provider='readwise',
    remote_connection_ref='connection', remote_document_id='document' WHERE source_fingerprint='one'`);
  expect(() => connection.sqlite.exec(`UPDATE import_sources SET remote_provider='readwise',
    remote_connection_ref='connection', remote_document_id='document' WHERE source_fingerprint='two'`)).toThrow();
});

it('rolls back columns and version when the migration transaction fails', () => {
  const connection = prepareV79();
  expect(() => initializeDatabaseSchema(connection.sqlite, {
    beforeVersionCommit: () => { throw new Error('injected identity failure'); }
  })).toThrow('injected identity failure');
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(79);
  expect(connection.sqlite.prepare("SELECT name FROM pragma_table_info('import_sources') WHERE name='remote_provider'").get())
    .toBeUndefined();
});
