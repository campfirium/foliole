// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-device-settings-tests';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createReadwiseImportSources } from '../../lib/core/import/importManagerSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { saveJsonSetting } from '../database/settingsStore.js';

import { loadImportManagerSettings, saveImportManagerSettings } from './importManagerSettings.js';
import { isReadwiseExecutionEnabled } from './readwiseDeviceSettings.js';

let tempRoot = '';
let readwiseRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-device-settings-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  readwiseRoot = path.join(tempRoot, 'Readwise');
  await Promise.all([
    'Articles', 'Books', 'Tweets', 'Podcasts',
    'Full Document Contents/Articles', 'Full Document Contents/Books',
    'Full Document Contents/Tweets', 'Full Document Contents/Podcasts'
  ].map((name) => fs.mkdir(path.join(readwiseRoot, name), { recursive: true })));
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('stores Readwise details as device settings and only the active selection as workspace settings', () => {
  const current = loadImportManagerSettings();
  const readwiseSources = createReadwiseImportSources(readwiseRoot).map((source) => ({
    ...source, keepState: 'enabled' as const
  }));
  const saved = saveImportManagerSettings({
    ...current,
    readwiseActiveDeviceName: current.readwiseCurrentDeviceName,
    readwiseActiveInstallationId: current.readwiseCurrentInstallationId,
    readwiseReaderConfig: { ...current.readwiseReaderConfig, enabled: true },
    readwiseRootPath: readwiseRoot,
    readwiseSources
  });

  expect(isReadwiseExecutionEnabled(saved)).toBe(true);
  expect(openDatabaseConnection().driver.queryOne<{ scope: string }>(
    'SELECT scope FROM setting_records WHERE key = ?', ['readwise_device_settings']
  )).toEqual({ scope: 'device' });
  expect(openDatabaseConnection().driver.queryOne<{ scope: string }>(
    'SELECT scope FROM setting_records WHERE key = ?', ['readwise_active_installation']
  )).toEqual({ scope: 'user_space' });
  const canonical = openDatabaseConnection().driver.queryOne<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?', ['import_manager_settings']
  );
  expect(canonical?.value).not.toContain(readwiseRoot);
});

it('fails closed when another installation is selected', () => {
  saveJsonSetting('readwise_active_installation', {
    deviceName: 'Other desktop', installationId: 'other-installation', platform: 'win32'
  });
  const current = loadImportManagerSettings();
  const saved = saveImportManagerSettings({
    ...current,
    readwiseReaderConfig: { ...current.readwiseReaderConfig, enabled: true },
    readwiseRootPath: readwiseRoot,
    readwiseSources: createReadwiseImportSources(readwiseRoot).map((source) => ({
      ...source, keepState: 'enabled' as const
    }))
  });
  expect(isReadwiseExecutionEnabled(saved)).toBe(false);
});
