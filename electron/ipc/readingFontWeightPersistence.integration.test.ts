// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ app: { getPath: () => state.root } }));
vi.mock('../nativeAppearance.js', () => ({ applyNativeBaseColorMode: vi.fn() }));
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: state.root, app_config_dir: state.root, app_cache_dir: path.join(state.root, 'cache'),
  documents_dir: state.root, app_log_dir: path.join(state.root, 'logs')
}) }));

import { APP_SETTINGS_STORAGE_KEYS } from '../../src/shared/config/appSettings.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { initializeDatabase } from '../database/migrate.js';
import { applySyncObjectsAsync } from '../database/syncObjectApply.js';
import { loadSyncObjects } from '../database/syncObjects.js';

import { loadAppSettingsState, saveAppSettingsState } from './storage.js';

let directory = '';
afterEach(async () => {
  closeDatabaseConnection();
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

function openHost(name: string) {
  closeDatabaseConnection();
  state.root = path.join(directory, name);
  initializeDatabase();
  initializeDesktopDeviceProfileFixture(name);
  return loadOrCreateDesktopHostName();
}

it('persists the last weight through reopen while normal sync preserves each host preference', async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-reading-weight-'));
  const key = APP_SETTINGS_STORAGE_KEYS.readingFontWeight;
  const first = openHost('reading-first');
  for (const weight of ['400', '450', '500']) {
    await saveAppSettingsState({ [key]: weight, [APP_SETTINGS_STORAGE_KEYS.interfaceFont]: 'noto-sans-sc' });
  }
  const firstRecord = loadSyncObjects([`host:windows:desktop:${first}:app_settings`]);
  expect(firstRecord).toHaveLength(1);
  const second = openHost('reading-second');
  await saveAppSettingsState({ [key]: '435', [APP_SETTINGS_STORAGE_KEYS.interfaceFont]: 'noto-sans-sc' });
  const secondRecord = loadSyncObjects([`host:windows:desktop:${second}:app_settings`]);
  expect(secondRecord).toHaveLength(1);
  await applySyncObjectsAsync(firstRecord);
  expect((await loadAppSettingsState())[key]).toBe('435');
  openHost('reading-first');
  await applySyncObjectsAsync(secondRecord);
  expect((await loadAppSettingsState())[key]).toBe('500');
  openHost('reading-second');
  expect((await loadAppSettingsState())[key]).toBe('435');
});
