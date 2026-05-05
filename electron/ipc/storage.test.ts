// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-tests-appdata';

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { loadAppSettingsState, saveAppSettingsState } from './storage.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-storage-test-'));
  mockedAppDataDir = path.join(tempRoot, 'config', 'Foliole');
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('persists app settings state into native app data file', async () => {
  await saveAppSettingsState({
    'foliole-ui-font-preset': 'inter',
    'foliole-interface-font-size': '18'
  });

  await expect(loadAppSettingsState()).resolves.toEqual({
    'foliole-ui-font-preset': 'inter',
    'foliole-interface-font-size': '18'
  });
});

it('filters malformed app settings payload values', async () => {
  const settingsPath = path.join(mockedAppDataDir, 'settings', 'app-settings.json');
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(
    settingsPath,
    JSON.stringify({
      'foliole-ui-font-preset': 'inter',
      'bad key with spaces': 'x',
      'foliole-interface-font-size': 18
    }),
    'utf8'
  );

  await expect(loadAppSettingsState()).resolves.toEqual({
    'foliole-ui-font-preset': 'inter'
  });
});
