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
    documents_dir: path.join(mockedAppDataDir, 'documents'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => mockedAppDataDir
  }
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { hasStartupRendererSettingChange, loadAppSettingsState, saveAppSettingsState } from './storage.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-storage-test-'));
  mockedAppDataDir = path.join(tempRoot, 'config', 'Foliole');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function writeLegacyWorkspaceFile(layout: Record<string, unknown>) {
  const workspaceDir = path.join(mockedAppDataDir, 'workspace');
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(
    path.join(workspaceDir, 'foliole-workspace-v1.json'),
    JSON.stringify({
      state: {
        layout
      }
    }),
    'utf8'
  );
}

it('persists app settings state into sqlite settings table', async () => {
  await saveAppSettingsState({
    'foliole-ui-font-preset': 'inter',
    'foliole-interface-font-size': '18'
  });

  await expect(loadAppSettingsState()).resolves.toEqual({
    'foliole-ui-font-preset': 'inter',
    'foliole-interface-font-size': '18'
  });

  const row = openDatabaseConnection().sqlite
    .prepare('SELECT key, value FROM settings WHERE key = ?')
    .get('app_settings') as { key: string; value: string } | undefined;
  expect(row?.key).toBe('app_settings');
});

it('merges app settings saves without dropping runtime-only keys', async () => {
  await saveAppSettingsState({
    'foliole-desktop-device-sync-enabled': 'true'
  });

  await saveAppSettingsState({
    'foliole-settings-active-category': 'appearance'
  });

  await expect(loadAppSettingsState()).resolves.toEqual({
    'foliole-desktop-device-sync-enabled': 'true',
    'foliole-settings-active-category': 'appearance'
  });
});

it('removes renderer settings that are absent from the next full snapshot', async () => {
  await saveAppSettingsState({
    'foliole-node-icon-scheduled-item-appearance': '{"effect":"double-line"}',
    'foliole-settings-active-category': 'appearance'
  });

  await saveAppSettingsState({
    'foliole-settings-active-category': 'appearance'
  });

  await expect(loadAppSettingsState()).resolves.toEqual({
    'foliole-settings-active-category': 'appearance'
  });
});

it('returns empty object when sqlite payload is malformed json', async () => {
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('app_settings', '{bad-json', '2026-03-06T00:00:00.000Z');

  await expect(loadAppSettingsState()).resolves.toEqual({});
});

it('filters malformed app settings payload values', async () => {
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run(
      'app_settings',
      JSON.stringify({
        'foliole-ui-font-preset': 'inter',
        'bad key with spaces': 'x',
        'foliole-interface-font-size': 18
      }),
      '2026-03-06T00:00:00.000Z'
    );

  await expect(loadAppSettingsState()).resolves.toEqual({
    'foliole-ui-font-preset': 'inter'
  });
});

it('filters app settings keys that have no persistence classification', async () => {
  await saveAppSettingsState({
    'foliole-ui-font-preset': 'inter',
    'foliole-unclassified-setting': 'x'
  });

  await expect(loadAppSettingsState()).resolves.toEqual({
    'foliole-ui-font-preset': 'inter'
  });
});

it('ignores the legacy workspace file when sqlite app settings are empty', async () => {
  await writeLegacyWorkspaceFile({
    documentMaxWidth: 960,
    isListCollapsed: true,
    isRightSidebarCollapsed: false,
    listWidth: 388,
    rightSidebarWidth: 410
  });

  await expect(loadAppSettingsState()).resolves.toEqual({});
});

it('keeps sqlite app settings when both sqlite and legacy workspace file define the same layout key', async () => {
  await writeLegacyWorkspaceFile({
    listWidth: 388
  });

  await saveAppSettingsState({
    'foliole-workspace-list-width': '320'
  });

  await expect(loadAppSettingsState()).resolves.toEqual({
    'foliole-workspace-list-width': '320'
  });
});

it('does not let the legacy workspace file override a new sqlite width', async () => {
  await writeLegacyWorkspaceFile({
    listWidth: 388
  });

  await saveAppSettingsState({
    'foliole-workspace-list-width': '450'
  });

  await expect(loadAppSettingsState()).resolves.toEqual({
    'foliole-workspace-list-width': '450'
  });
});

it('does not treat unrelated renderer settings as startup renderer changes', () => {
  expect(hasStartupRendererSettingChange(
    { 'foliole-update-check-state': 'old' },
    { 'foliole-update-check-state': 'new' }
  )).toBe(false);
});

it('treats startup layout settings as startup renderer changes', () => {
  expect(hasStartupRendererSettingChange(
    { 'foliole-workspace-dual-list-width': '190' },
    { 'foliole-workspace-dual-list-width': '224' }
  )).toBe(true);
});
