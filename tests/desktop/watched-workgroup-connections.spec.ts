import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

async function seedTwoDeviceWatchedSources(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(async (_, cwd) => {
    const cryptoApi = process.getBuiltinModule('crypto');
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!cryptoApi || !moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    const identity = require(pathApi.join(cwd, 'dist/electron/database/deviceIdentity.js'));
    const bindings = require(pathApi.join(cwd, 'dist/electron/database/watchedFolderBindings.js'));
    await connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const localId = identity.loadDesktopDeviceId();
      if (!localId) throw new Error('local device identity unavailable');
      const groupId = 'watched-connections-acceptance';
      driver.execute(`INSERT INTO sync_groups
        (group_id, display_name, workgroup_key, created_at, updated_at)
        VALUES (?, 'Workgroup', ?, 'now', 'now')`,
      [groupId, Buffer.alloc(32, 1).toString('base64url')]);
      const addDevice = (deviceId: string, name: string, platform: string, libraryPath: string) => {
        driver.execute(`INSERT INTO sync_group_devices
          (group_id, device_identity_key, device_anchor, canonical_library_path,
           device_name, platform, state, joined_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'active', 'now', 'now')`,
        [groupId, deviceId, `anchor-${deviceId}`, libraryPath, name, platform]);
      };
      addDevice(localId, 'This Mac', 'darwin', '/tmp/foliole-local');
      addDevice('windows-device', 'Office PC', 'win32', 'D:\\Foliole');
      driver.execute(`INSERT INTO sync_group_local_state
        (singleton_id, group_id, local_device_identity_key, state, updated_at)
        VALUES (1, ?, ?, 'active', 'now')`, [groupId, localId]);
      const local = bindings.upsertChangedWatchedFolderSource({
        id: 'draft-import-source-101', actionMode: 'keep', archivePath: '',
        highlightMode: 'merged', highlightPath: '', keepPreview: null,
        keepState: 'enabled', primaryPath: '/Users/test/Local Articles'
      }, '2026-09-25T00:00:00.000Z');
      if (!local) throw new Error('local binding unavailable');
      bindings.disconnectWatchedFolderBinding(local.binding_id);
      driver.execute(`INSERT INTO desktop_sources
        (source_ref, source_type, config_ref, host_name, host_platform, root_path,
         path_flavor, type_settings_json, created_at, updated_at)
        VALUES ('watched:windows-source', 'watched', 'windows-source', 'Office PC',
          'win32', '', 'windows', '{}', 'now', 'now')`);
      driver.execute(`INSERT INTO watched_folder_bindings
        (binding_id, connection_status, action_mode, highlight_mode, primary_path,
         reported_path, created_at, updated_at, source_ref, owner_device_identity_key)
        VALUES ('windows-source', 'needs-folder', 'keep', 'merged', '',
          'D:\\Research\\Articles', 'now', 'now', 'watched:windows-source', 'windows-device')`);
    });
  }, process.cwd());
}

test('shows only other devices above local watched-folder settings', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await seedTwoDeviceWatchedSources(desktopApp);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openSettingsCategory(desktopWindow, 'Import');
  const groupList = dialog.getByRole('region', {
    name: /^(Watched folders in this workgroup|工作组中的监听文件夹)$/
  });
  await expect(groupList.getByRole('group', { name: 'Office PC' })).toBeVisible();
  await expect(groupList.getByText('D:\\Research\\Articles', { exact: true })).toBeVisible();
  await expect(groupList.getByRole('group', { name: 'This Mac' })).toHaveCount(0);
  await expect(groupList.getByText('/Users/test/Local Articles', { exact: true })).toHaveCount(0);
  const screenshot = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance',
    'watched-workgroup-connections.png');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  await dialog.screenshot({ path: screenshot });
  await testInfo.attach('watched-workgroup-connections', { path: screenshot, contentType: 'image/png' });
});
