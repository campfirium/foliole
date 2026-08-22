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

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-host-isolation-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps another Host Readwise config and Source reference independent', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO desktop_sources (source_ref, source_type, config_ref, host_name,
    host_platform, root_path, path_flavor, type_settings_json, created_at, updated_at)
    VALUES ('readwise:remote-articles', 'readwise', 'readwise-articles', 'Remote Host',
      'darwin', '/remote/readwise/articles', 'posix', '{"kind":"articles"}', 'old', 'old')`);

  const saved = saveImportManagerSettings({
    readwiseRootPath: '/local/readwise',
    readwiseSources: [{
      highlightMode: 'merged', highlightPath: '', id: 'readwise-articles',
      keepPreview: null, keepState: 'enabled', kind: 'articles',
      primaryPath: '/local/readwise/articles'
    }]
  });

  expect(saved.readwiseSources[0]?.id).toMatch(/^readwise-/);
  expect(driver.queryOne(`SELECT host_name, root_path FROM desktop_sources
    WHERE source_ref = 'readwise:remote-articles'`)).toEqual({
    host_name: 'Remote Host', root_path: '/remote/readwise/articles'
  });
  expect(driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'import_manager_settings'"
  )?.value).not.toContain('readwiseRootPath');
  expect(driver.queryAll(`SELECT scope, host_name FROM setting_records
    WHERE key = 'readwise_import_settings'`)).toEqual([
    expect.objectContaining({ scope: 'host' })
  ]);
});
