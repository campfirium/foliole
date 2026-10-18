import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

async function seedRemoteMirror(desktopApp: ElectronApplication, active = true) {
  await desktopApp.evaluate(async (_electron, active) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const load = (file: string) => require(`${process.cwd()}/dist/${file}.js`);
    const connection = load('electron/database/connection');
    await connection.runWithDatabaseConnectionOwner(() => {
      const groups = load('electron/database/syncGroupStore');
      const { createSyncGroupDeviceIdentity } = load('lib/platform/syncGroupUnifiedContract');
      const { upsertDesktopSource } = load('electron/database/desktopSources');
      const groupId = 'external-native-group';
      const local = createSyncGroupDeviceIdentity({
        device_anchor: '11111111-1111-4111-8111-111111111111', group_id: groupId,
        library_path: connection.openDatabaseConnection().dbPath, path_flavor: 'posix' });
      const remote = createSyncGroupDeviceIdentity({
        device_anchor: '22222222-2222-4222-8222-222222222222', group_id: groupId,
        library_path: '/remote/foliole.db', path_flavor: 'posix' });
      groups.createDesktopSyncGroup({ device: local, deviceName: 'This Mac', platform: 'darwin' });
      groups.registerSyncGroupDevice({ device: remote, deviceName: 'Windows PC', platform: 'win32' });
      const driver = connection.openDatabaseConnection().driver;
      for (const [id, folderPath] of [['remote-docs', 'D:\\Docs'], ['remote-projects', 'D:\\Projects']]) {
        const source = upsertDesktopSource({ configRef: id, rootPath: folderPath, sourceType: 'external',
          hostName: 'Windows PC', hostPlatform: 'win32', ownerDeviceIdentityKey: remote.identity_key,
          updatedAt: '2026-10-01T00:00:00.000Z' });
        driver.execute(`INSERT INTO external_search_folders
          (id, folder_path, attachment_mode, created_at, updated_at, source_ref)
          VALUES (?, ?, 'document_relative', 'now', 'now', ?)`, [id, folderPath, source.source_ref]);
      }
      if (!active) groups.leaveDesktopSyncGroupDevice(local.identity_key);
    });
  }, active);
}

test('keeps remote External libraries read-only in native settings', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedRemoteMirror(desktopApp);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openSettingsCategory(desktopWindow, 'ExternalFolder');
  const remote = dialog.getByRole('region', { name: /^(Other hosts|其他主机)$/ });
  await expect(remote).toBeVisible();
  await expect(remote.getByText('Windows PC', { exact: true })).toBeVisible();
  await expect(remote.getByText('D:\\Docs', { exact: true })).toBeVisible();
  await expect(remote.getByText('D:\\Projects', { exact: true })).toBeVisible();
  await expect(remote.getByRole('button')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^(Add folder|添加文件夹)$/ })).toBeVisible();
  const screenshot = path.resolve('.tmp/artifacts/external-folder-removal/remote-readonly.png');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  await dialog.screenshot({ path: screenshot });
  await testInfo.attach('remote-external-readonly', { path: screenshot, contentType: 'image/png' });
});

test('hides remote External libraries after leaving the group', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedRemoteMirror(desktopApp, false);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openSettingsCategory(desktopWindow, 'ExternalFolder');
  await expect(dialog.getByRole('region', { name: /^(Other hosts|其他主机)$/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^(Add folder|添加文件夹)$/ })).toBeVisible();
});
