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

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-host-settings-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function legacySettings() {
  return {
    detailsOpen: false,
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      highlightSeparator: '\\n\\n',
      importScope: 'highlights_only',
      newHighlightsHeading: '## New highlights added',
      noteKeyword: 'Note:',
      syncFrequency: 'daily',
      tagKeyword: 'Tags:',
      validatedAt: '2026-08-20T00:00:00.000Z',
      withHighlightsDestination: 'external',
      withoutHighlightsDestination: 'off'
    },
    readwiseRootPath: '/Library/Readwise',
    readwiseSources: [{
      actionMode: 'keep',
      archivePath: '',
      highlightMode: 'split',
      highlightPath: '/Library/Readwise/Articles',
      id: 'readwise-articles',
      keepPreview: {
        blockedCount: 0,
        discoveredCount: 2,
        failedCount: 0,
        newCount: 1,
        previewedAt: '2026-08-20T00:00:00.000Z',
        samples: [],
        unchangedCount: 1,
        updatedCount: 0
      },
      keepState: 'enabled',
      kind: 'articles',
      primaryPath: '/Library/Readwise/Full Document Contents/Articles'
    }],
    sources: [],
    titleStrategy: 'heading',
    updatedAt: '2026-08-20T00:00:00.000Z',
    version: 4
  };
}

function seedLegacySource(hostName: string, suffix = '') {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO desktop_sources (source_ref, source_type, config_ref, host_name,
    host_platform, root_path, path_flavor, type_settings_json, created_at, updated_at)
    VALUES (?, 'readwise', ?, ?, 'darwin', ?, 'posix', ?, 'now', 'now')`, [
    `readwise:readwise-articles${suffix}`,
    `readwise-articles${suffix}`,
    hostName,
    `/Library/Readwise${suffix}/Full Document Contents/Articles`,
    JSON.stringify({ keepState: 'enabled', kind: suffix ? 'books' : 'articles' })
  ]);
}

function prepareV76() {
  const connection = openDatabaseConnection();
  const value = JSON.stringify(legacySettings());
  connection.driver.execute(`INSERT INTO settings (key, value, updated_at) VALUES
    ('host_name', ?, 'now'), ('import_manager_settings', ?, '2026-08-20T00:00:00.000Z')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  [JSON.stringify('Host A'), value]);
  connection.sqlite.pragma('user_version = 76');
  return connection;
}

it('moves the local Readwise projection into Host scope without rewriting Source or Topic Location', () => {
  const connection = prepareV76();
  seedLegacySource('Host A');
  connection.driver.execute(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('topic-a', NULL, 'topic', 'Topic', '', 'now', 'now')`);
  connection.driver.execute(`INSERT INTO import_sources (source_fingerprint, provider, source_kind,
    source_name, source_locator, first_imported_at, last_imported_at, last_content_fingerprint,
    latest_node_id, source_ref, source_location) VALUES
    ('fingerprint-a', 'readwise', 'markdown', 'Topic', '/old/topic.md', 'now', 'now',
      'hash', 'topic-a', 'readwise:readwise-articles', 'Articles/topic.md')`);

  initializeDatabaseSchema(connection.sqlite);

  const global = JSON.parse(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'import_manager_settings'"
  )!.value) as Record<string, unknown>;
  expect(global).not.toHaveProperty('readwiseReaderConfig');
  expect(global).not.toHaveProperty('readwiseRootPath');
  expect(global).not.toHaveProperty('readwiseSources');
  expect(connection.driver.queryOne(`SELECT scope, host_name FROM setting_records
    WHERE key = 'readwise_import_settings'`)).toEqual({ host_name: 'Host A', scope: 'host' });
  expect(connection.driver.queryOne(`SELECT source_ref, host_name, root_path FROM desktop_sources
    WHERE config_ref = 'readwise-articles'`)).toEqual({
    host_name: 'Host A',
    root_path: '/Library/Readwise/Full Document Contents/Articles',
    source_ref: 'readwise:readwise-articles'
  });
  expect(connection.driver.queryOne(`SELECT source_ref, source_location FROM import_sources
    WHERE source_fingerprint = 'fingerprint-a'`)).toEqual({
    source_location: 'Articles/topic.md', source_ref: 'readwise:readwise-articles'
  });
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('rolls back the cutover when legacy Readwise Sources name more than one owner', () => {
  const connection = prepareV76();
  seedLegacySource('Host A');
  seedLegacySource('Host B', '-books');

  expect(() => initializeDatabaseSchema(connection.sqlite)).toThrow('readwise_host_settings_owner_ambiguous');

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(76);
  expect(connection.driver.queryOne("SELECT value FROM settings WHERE key = 'readwise_import_settings'"))
    .toBeUndefined();
  expect(JSON.parse(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'import_manager_settings'"
  )!.value)).toHaveProperty('readwiseRootPath', '/Library/Readwise');
});
