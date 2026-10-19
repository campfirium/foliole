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
    await connection.runWithDatabaseConnectionOwner(async () => {
      const groups = load('electron/database/syncGroupStore');
      const { createSyncGroupDeviceIdentity } = load('lib/platform/syncGroupUnifiedContract');
      const { applySyncObjectInTransaction } = load('lib/core/sync/syncObjectApplyExecutor');
      const { computeSyncContentHash } = load('lib/core/database/syncState');
      const { createBetterSqliteDbPort } = load('electron/database/betterSqliteDbPort');
      const groupId = 'external-native-group';
      const local = createSyncGroupDeviceIdentity({
        device_anchor: '11111111-1111-4111-8111-111111111111', group_id: groupId,
        library_path: connection.openDatabaseConnection().dbPath, path_flavor: 'posix' });
      const remote = createSyncGroupDeviceIdentity({
        device_anchor: '22222222-2222-4222-8222-222222222222', group_id: groupId,
        library_path: '/remote/foliole.db', path_flavor: 'posix' });
      groups.createDesktopSyncGroup({ device: local, deviceName: 'This Mac', platform: 'darwin' });
      groups.registerSyncGroupDevice({ device: remote, deviceName: 'Windows PC', platform: 'win32' });
      const db = createBetterSqliteDbPort(connection.openDatabaseConnection().sqlite);
      for (const [id, folderPath] of [['remote-docs', 'D:\\Docs'], ['remote-projects', 'D:\\Projects']]) {
        const payload = { id, folder_path: folderPath, source_ref: `external:${id}`,
          host_name: 'Windows PC', host_platform: 'win32', owner_device_identity_key: remote.identity_key,
          attachment_mode: 'document_relative', excluded_dirs_json: '[]' };
        await applySyncObjectInTransaction(db, { object_type: 'external_folder', object_id: id,
          payload_json: JSON.stringify(payload), content_hash: computeSyncContentHash('external_folder', payload),
          deleted_at: null, updated_at: '2026-10-01T00:00:00.000Z' });
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

test('keeps this device External library local after leaving the group', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const folderPath = await desktopApp.evaluate(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const load = (file: string) => require(`${process.cwd()}/dist/${file}.js`);
    const nodeFs = process.getBuiltinModule('fs')!;
    const nodePath = process.getBuiltinModule('path')!;
    const nodeOs = process.getBuiltinModule('os')!;
    const folder = nodeFs.realpathSync(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'foliole-kept-external-')));
    const connection = load('electron/database/connection');
    await connection.runWithDatabaseConnectionOwner(async () => {
      const groups = load('electron/database/syncGroupStore');
      const binding = load('electron/deviceAnchorStore').loadDesktopLibraryWriterBinding(connection.openDatabaseConnection().dbPath);
      const identity = load('lib/platform/syncGroupUnifiedContract').createSyncGroupDeviceIdentity({
        device_anchor: binding.deviceAnchor, group_id: 'external-kept-group',
        library_path: binding.libraryPath, path_flavor: 'posix' });
      groups.createDesktopSyncGroup({ device: identity, deviceName: 'This Mac', platform: 'darwin' });
      const now = new Date().toISOString();
      const source = load('electron/database/desktopSources').upsertDesktopSource({
        configRef: 'kept-docs', rootPath: folder, sourceType: 'external', updatedAt: now });
      connection.openDatabaseConnection().driver.execute(`INSERT INTO external_search_folders
        (id, folder_path, attachment_mode, created_at, updated_at, source_ref)
        VALUES ('kept-docs', ?, 'document_relative', ?, ?, ?)`, [folder, now, now, source.source_ref]);
      groups.leaveDesktopSyncGroupDevice(identity.identity_key);
    });
    return folder;
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openSettingsCategory(desktopWindow, 'ExternalFolder');
  const local = dialog.getByRole('table', { name: /^(External folders|外部文件夹)$/ });
  await expect(local.getByRole('button', { name: /^(Choose folder|Select folder|选择文件夹)$/ })
    .filter({ hasText: path.basename(folderPath) })).toBeEnabled();
  await expect(dialog.getByRole('region', { name: /^(Other hosts|其他主机)$/ })).toHaveCount(0);
  const screenshot = path.resolve('.tmp/artifacts/external-folder-removal/kept-after-leave.png');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  await dialog.screenshot({ path: screenshot });
  await testInfo.attach('external-kept-after-leave', { path: screenshot, contentType: 'image/png' });
});
