// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-device-connection';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createDefaultReadwiseHostSettings } from '../../lib/core/import/readwiseHostSettings.js';

import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import {
  loadReadwiseDeviceConnection,
  migrateLegacyReadwiseDeviceConnection
} from './readwiseDeviceConnection.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-device-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('moves a legacy Host connection into the device registry', () => {
  const apiConnection = {
    secretRef: 'readwise-api-00000000-0000-4000-8000-000000000000.bin',
    state: 'connected' as const, verifiedAt: 'verified'
  };
  saveJsonSetting('readwise_remote_source', {
    connectionRef: 'readwise-source', createdAt: 'created', updatedAt: 'updated', version: 1
  });
  saveJsonSetting('readwise_import_settings', {
    ...createDefaultReadwiseHostSettings(), apiConnection
  });

  migrateLegacyReadwiseDeviceConnection();

  expect(loadReadwiseDeviceConnection('readwise-source')).toEqual(apiConnection);
  expect(loadJsonSetting('readwise_import_settings')).not.toHaveProperty('apiConnection');
});
