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
    "UPDATE settings SET value = '\"Host B\"' WHERE key = 'device_id'"
  );
  updateLocalDesktopSourceHosts({
    currentHostName: 'Host B',
    driver: openDatabaseConnection().driver,
    installationRef: 'installation-a',
    previousHostName: 'Host A',
    updatedAt: '2026-08-19T02:00:00.000Z'
  });
  expect(resolveDesktopSourceAddress(source.source_ref, location)).toBe(path.join(secondRoot, location));
  expect(location).toBe('nested/topic.md');
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
