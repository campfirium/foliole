// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-manager-ownership-tests';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir, app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'), app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import { loadImportManagerSettings, saveImportManagerSettings } from './importManagerSettings.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-manager-ownership-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('keeps legacy watched settings disabled until a device copies them', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO sync_groups (group_id, display_name, timeline_id, created_by_device_id, created_at, updated_at)
     VALUES ('group-1', 'Devices', 'timeline-1', 'desktop-local', '2026-08-17T00:00:00Z', '2026-08-17T00:00:00Z')`
  );
  driver.execute(
    `INSERT INTO sync_group_members (
      group_id, device_id, device_kind, device_name, state, approved_by_device_id,
      authorization_id, joined_at, updated_at
    ) VALUES
      ('group-1', 'desktop-local', 'desktop', 'Mac', 'active', 'desktop-local', 'auth-local',
       '2026-08-17T00:00:00Z', '2026-08-17T00:00:00Z'),
      ('group-1', 'desktop-old', 'desktop', 'Old PC', 'active', 'desktop-local', 'auth-old',
       '2026-08-17T00:01:00Z', '2026-08-17T00:01:00Z')`
  );
  driver.execute(
    `INSERT INTO sync_group_local_state (singleton_id, group_id, local_device_id, member_state, updated_at)
     VALUES (1, 'group-1', 'desktop-local', 'active', '2026-08-17T00:00:00Z')`
  );
  saveJsonSetting('import_manager_settings', {
    sources: [{
      actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '',
      id: 'legacy-watched', keepPreview: null, keepState: 'enabled', primaryPath: '/old-device/inbox'
    }]
  });

  const loaded = loadImportManagerSettings();
  expect(loaded.sources[0]?.ownership).toMatchObject({ editable: false, ownerInstallationId: null });
  saveImportManagerSettings({ ...loaded, sources: [] });
  expect(loadJsonSetting('import_manager_settings')).not.toHaveProperty('sources');
  expect(driver.queryOne(
    `SELECT binding_id, enabled, owner_installation_id FROM watched_folder_bindings`
  )).toEqual({ binding_id: 'legacy-watched', enabled: 0, owner_installation_id: null });
});

it('removes a local watched binding when its paths are cleared', async () => {
  const sourcePath = path.join(tempRoot, 'watch');
  await fs.mkdir(sourcePath, { recursive: true });
  const source = {
    actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '',
    id: 'watched-local', keepPreview: null, keepState: 'enabled', primaryPath: sourcePath
  } as const;
  saveImportManagerSettings({ sources: [source] });

  saveImportManagerSettings({ sources: [{ ...source, keepState: 'draft', primaryPath: '' }] });

  expect(openDatabaseConnection().driver.queryOne(
    'SELECT enabled, deleted_at FROM watched_folder_bindings WHERE binding_id = ?', [source.id]
  )).toEqual({ deleted_at: expect.any(String), enabled: 0 });
});
