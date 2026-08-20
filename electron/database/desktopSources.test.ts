// @vitest-environment node

import fs from 'node:fs';
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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import {
  resolveDesktopSourceAddress,
  updateLocalDesktopSourceHosts,
  upsertDesktopSource
} from './desktopSources.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'foliole-desktop-source-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  initializeDesktopDeviceProfileFixture('Host A');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
});

it('resolves current addresses without rewriting locations when Host or Source changes', async () => {
  const firstRoot = path.join(tempRoot, 'first');
  const secondRoot = path.join(tempRoot, 'second');
  await fs.promises.mkdir(path.join(firstRoot, 'nested'), { recursive: true });
  await fs.promises.mkdir(path.join(secondRoot, 'nested'), { recursive: true });
  const location = 'nested/topic.md';
  const source = upsertDesktopSource({
    configRef: 'reader-a', rootPath: firstRoot, sourceType: 'readwise', updatedAt: '2026-08-19T00:00:00.000Z'
  });

  expect(resolveDesktopSourceAddress(source.source_ref, location)).toBe(path.join(firstRoot, location));
  upsertDesktopSource({
    configRef: 'reader-a', rootPath: secondRoot, sourceType: 'readwise', updatedAt: '2026-08-19T01:00:00.000Z'
  });
  expect(resolveDesktopSourceAddress(source.source_ref, location)).toBe(path.join(secondRoot, location));

  openDatabaseConnection().driver.execute(
    "UPDATE settings SET value = '\"Host B\"' WHERE key = 'host_name'"
  );
  updateLocalDesktopSourceHosts({
    currentHostName: 'Host B',
    currentHostPlatform: process.platform,
    driver: openDatabaseConnection().driver,
    previousHostName: 'Host A',
    updatedAt: '2026-08-19T02:00:00.000Z'
  });
  expect(resolveDesktopSourceAddress(source.source_ref, location)).toBe(path.join(secondRoot, location));
  expect(openDatabaseConnection().driver.queryOne(
    'SELECT host_name, root_path FROM desktop_sources WHERE source_ref = ?', [source.source_ref]
  )).toEqual({ host_name: 'Host B', root_path: secondRoot });
  expect(location).toBe('nested/topic.md');
});

it('executes only a Source whose Host is current and whose root is available', async () => {
  const rootPath = path.join(tempRoot, 'owned');
  await fs.promises.mkdir(rootPath, { recursive: true });
  const source = upsertDesktopSource({
    configRef: 'external-a', rootPath, sourceType: 'external', updatedAt: '2026-08-19T00:00:00.000Z'
  });
  const driver = openDatabaseConnection().driver;
  const before = driver.queryOne(`SELECT root_path, host_name, host_platform, type_settings_json
    FROM desktop_sources WHERE source_ref = ?`, [source.source_ref]);
  driver.execute(`INSERT INTO desktop_sources (source_ref, source_type, config_ref, host_name, host_platform,
    root_path, path_flavor, type_settings_json, created_at, updated_at)
    VALUES ('watched:remote', 'watched', 'remote', 'Host B', ?, ?, 'posix', '{}', 'now', 'now')`,
  [process.platform, rootPath]);

  expect(resolveDesktopSourceAddress('watched:remote', 'topic.md')).toBeNull();
  mockedAppDataDir = path.join(tempRoot, 'other-installation');
  expect(resolveDesktopSourceAddress(source.source_ref, 'topic.md')).toBe(path.join(rootPath, 'topic.md'));
  expect(driver.queryOne(`SELECT root_path, host_name, host_platform, type_settings_json
    FROM desktop_sources WHERE source_ref = ?`, [source.source_ref])).toEqual(before);
});

it('updates an owned External Host projection and its sync fact together', async () => {
  const rootPath = path.join(tempRoot, 'external');
  await fs.promises.mkdir(rootPath, { recursive: true });
  saveExternalSearchFolders([{
    attachment_mode: 'document_relative_first_then_fixed_root', attachment_root_path: null,
    excluded_dirs: [], folder_path: rootPath, id: 'external-a'
  }]);
  const driver = openDatabaseConnection().driver;
  const beforeHash = driver.queryOne<{ content_hash: string }>(
    "SELECT content_hash FROM sync_object_state WHERE object_type = 'external_folder' AND object_id = 'external-a'"
  )?.content_hash;

  updateLocalDesktopSourceHosts({
    currentHostName: 'Host B', currentHostPlatform: 'darwin', driver, previousHostName: 'Host A',
    updatedAt: '2026-08-19T03:00:00.000Z'
  });

  expect(driver.queryOne(`SELECT s.host_name, s.host_platform, s.root_path
    FROM desktop_sources s JOIN external_search_folders f ON f.source_ref = s.source_ref
    WHERE s.config_ref = 'external-a'`)).toEqual({
    host_name: 'Host B', host_platform: 'darwin', root_path: rootPath
  });
  const afterState = driver.queryOne<{ content_hash: string; sync_dirty: number }>(
    "SELECT content_hash, sync_dirty FROM sync_object_state WHERE object_type = 'external_folder' AND object_id = 'external-a'"
  );
  expect(afterState?.sync_dirty).toBe(1);
  expect(afterState?.content_hash).not.toBe(beforeHash);
});

it('returns unavailable without deleting topics or historical source fields', async () => {
  const rootPath = path.join(tempRoot, 'missing-later');
  await fs.promises.mkdir(rootPath, { recursive: true });
  const source = upsertDesktopSource({
    configRef: 'watched-a', rootPath, sourceType: 'watched', updatedAt: '2026-08-19T00:00:00.000Z'
  });
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('topic-a', NULL, 'topic', 'Topic', '', 'now', 'now')`);
  driver.execute(`INSERT INTO import_sources (source_fingerprint, provider, source_kind, source_name,
    source_locator, first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id,
    source_ref, source_location) VALUES ('fingerprint-a', 'desktop_text_file', 'markdown', 'topic.md',
    '/historical/topic.md', 'now', 'now', 'content-a', 'topic-a', ?, 'topic.md')`, [source.source_ref]);

  await fs.promises.rm(rootPath, { recursive: true });

  expect(resolveDesktopSourceAddress(source.source_ref, 'topic.md')).toBeNull();
  expect(driver.queryOne('SELECT id, deleted_at FROM nodes WHERE id = ?', ['topic-a']))
    .toEqual({ deleted_at: null, id: 'topic-a' });
  expect(driver.queryOne(`SELECT source_locator, source_fingerprint FROM import_sources
    WHERE source_fingerprint = 'fingerprint-a'`)).toEqual({
    source_fingerprint: 'fingerprint-a', source_locator: '/historical/topic.md'
  });
});
