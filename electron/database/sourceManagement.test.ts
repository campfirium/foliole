// @vitest-environment node

import fs from 'node:fs/promises';
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
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';
import { confirmSourceManagement, previewSourceManagement } from './sourceManagement.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-source-management-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  initializeDesktopDeviceProfileFixture('This Mac');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function seedExternalSource(id: string, hostName: string) {
  const root = path.join(tempRoot, id);
  saveExternalSearchFolders([{
    attachment_mode: 'document_relative_first_then_fixed_root', attachment_root_path: null,
    excluded_dirs: [], folder_path: root, id
  }]);
  openDatabaseConnection().driver.execute(
    'UPDATE desktop_sources SET host_name = ? WHERE source_ref = ?', [hostName, `external:${id}`]
  );
  return `external:${id}`;
}

it('previews removal without changing Source, Topic, or Location and preserves Topic history after confirm', () => {
  const sourceRef = seedExternalSource('external-a', 'Other Mac');
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('topic-a', NULL, 'topic', 'Topic A', 'Body', 'now', 'now')`);
  driver.execute(`INSERT INTO import_sources (source_fingerprint, provider, source_kind, source_name,
    source_locator, first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id,
    source_ref, source_location) VALUES ('fingerprint-a', 'desktop_text_file', 'markdown', 'topic.md',
    '/old/topic.md', 'now', 'now', 'hash-a', 'topic-a', ?, 'topic.md')`, [sourceRef]);

  expect(previewSourceManagement({ action: 'remove_source', sourceRef })).toMatchObject({
    source_count: 1, topic_count: 1
  });
  expect(driver.queryOne('SELECT source_ref FROM desktop_sources WHERE source_ref = ?', [sourceRef]))
    .toEqual({ source_ref: sourceRef });

  confirmSourceManagement({ action: 'remove_source', sourceRef });

  expect(driver.queryOne('SELECT source_ref FROM desktop_sources WHERE source_ref = ?', [sourceRef])).toBeUndefined();
  expect(driver.queryOne('SELECT id, deleted_at FROM nodes WHERE id = ?', ['topic-a']))
    .toEqual({ deleted_at: null, id: 'topic-a' });
  expect(driver.queryOne(`SELECT source_ref, source_location FROM import_sources
    WHERE source_fingerprint = 'fingerprint-a'`)).toEqual({ source_location: 'topic.md', source_ref: sourceRef });
});

it('rejects External device replacement without changing either library', () => {
  const firstRef = seedExternalSource('external-a', 'Other Mac');
  const secondRef = seedExternalSource('external-b', 'Other Mac');
  const driver = openDatabaseConnection().driver;
  const before = driver.queryAll('SELECT * FROM desktop_sources ORDER BY source_ref');
  for (const run of [previewSourceManagement, confirmSourceManagement]) {
    expect(() => run({ action: 'replace_host', hostName: 'Other Mac', sourceType: 'external' }))
      .toThrow('external_folder_transfer_not_supported');
  }
  expect(driver.queryAll('SELECT * FROM desktop_sources ORDER BY source_ref')).toEqual(before);
  expect(before.map(source => source.source_ref)).toEqual([firstRef, secondRef]);
});

it('rejects removing a same-name foreign library through source management', () => {
  const sourceRef = seedExternalSource('foreign', 'This Mac');
  const driver = openDatabaseConnection().driver;
  driver.execute("UPDATE desktop_sources SET type_settings_json = json_set(type_settings_json, '$.ownerDeviceIdentityKey', 'foreign') WHERE source_ref = ?", [sourceRef]);
  expect(() => confirmSourceManagement({ action: 'remove_source', sourceRef })).toThrow('external_folder_not_local');
  expect(driver.queryOne('SELECT source_ref FROM desktop_sources WHERE source_ref = ?', [sourceRef])).toEqual({ source_ref: sourceRef });
});
