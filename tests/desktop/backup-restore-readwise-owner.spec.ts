import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { openBackupsSection, openSettingsCategory } from './harness/settings';

async function seedLegacySource(app: ElectronApplication) {
  return app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const load = (name: string) => require(pathApi.join(process.cwd(), `dist/electron/database/${name}.js`));
    const connection = load('connection');
    return connection.runWithDatabaseConnectionOwner(() => {
      const identity = require(pathApi.join(process.cwd(), 'dist/lib/platform/syncGroupUnifiedContract.js'));
      const groups = load('syncGroupStore');
      const groupId = 'legacy-readwise-backup';
      const device = identity.createSyncGroupDeviceIdentity({
        device_anchor: '11111111-1111-4111-8111-111111111111', group_id: groupId,
        library_path: connection.openDatabaseConnection().dbPath, path_flavor: 'posix'
      });
      groups.createDesktopSyncGroup({ device, deviceName: 'This Mac', platform: 'darwin' });
      const remote = identity.createSyncGroupDeviceIdentity({
        device_anchor: '22222222-2222-4222-8222-222222222222', group_id: groupId,
        library_path: 'D:\\Library\\foliole.db', path_flavor: 'windows'
      });
      groups.registerSyncGroupDevice({ device: remote, deviceName: 'Offline desktop', platform: 'win32' });
      const rootPath = pathApi.join(connection.openDatabaseConnection().dbPath, '..', 'Readwise');
      require('node:fs').mkdirSync(rootPath, { recursive: true });
      load('desktopSources').upsertDesktopSource({ configRef: 'restore-readwise', rootPath,
        sourceType: 'readwise', typeSettings: { keepState: 'draft' }, updatedAt: new Date().toISOString() });

    });
  });
}

async function makeLocalOwner(app: ElectronApplication) {
  await app.evaluate(() => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const load = (name: string) => require(pathApi.join(process.cwd(), `dist/electron/database/${name}.js`));
    return load('connection').runWithDatabaseConnectionOwner(() => {
      const group = load('syncGroupStore').loadDesktopSyncGroup();
      load('readwiseOwnerGuard').saveReadwiseOwnerGuard({ epoch: 4, groupId: group.group_id, mode: 'relay',
        ownerId: group.local_device_identity_key, state: 'active', targetId: null });
      load('settingsStore').saveJsonSetting('readwise_active_host', {
        device_identity_key: group.local_device_identity_key, host_name: 'This Mac', epoch: 4, selection_source: 'chosen'
      });
    });
  });
}

async function prepareLegacyBackup(app: ElectronApplication, page: Page) {
  await seedLegacySource(app);
  const backup = await page.evaluate(() => window.electronAPI.invoke('backup_sqlite_database', {})) as {
    destinationPath: string
  };
  await makeLocalOwner(app);
  return backup.destinationPath;
}

async function assignment(page: Page) {
  return page.evaluate(() => window.electronAPI.invoke('load_readwise_host_assignment', {})) as Promise<{
    is_active: boolean; legacy_unassigned: boolean; handoff_pending: boolean; active_host_name: string | null
  }>;
}

test('restores a legacy backup with this device responsible while group sync stays paused', async ({
  desktopApp, desktopWindow
}, info) => {
  const file = await prepareLegacyBackup(desktopApp, desktopWindow);
  await desktopWindow.reload();
  expect((await assignment(desktopWindow)).is_active).toBe(true);
  const settings = await openBackupsSection(desktopWindow);
  await settings.locator('[data-settings-row]').filter({
    has: desktopWindow.getByRole('heading', { name: path.basename(file) })
  }).getByRole('button', { name: /^(Restore|恢复)$/ }).click();
  const action = desktopWindow.getByRole('dialog', { name: /^(Sync after restoring|恢复后的同步)$/ });
  await expect(action).toBeVisible();
  await action.getByRole('button', { name: /Pause sync and restore only this device first|暂停同步，先只恢复本机/ }).click();
  const done = desktopWindow.getByRole('dialog', { name: /^(Backup restored|备份已恢复)$/ });
  await expect(done).toBeVisible();
  await done.getByRole('button', { name: /^(Done|完成)$/ }).click();
  expect(await assignment(desktopWindow)).toMatchObject({ is_active: true, legacy_unassigned: false,
    handoff_pending: false, active_host_name: 'This Mac' });
  await expect(desktopWindow.getByRole('dialog', { name: /^(Readwise import device|Readwise 导入设备)$/ })).toHaveCount(0);
  const sync = await openSettingsCategory(desktopWindow, 'Sync');
  await expect(sync.getByText(/Sync paused after restore|恢复后同步已暂停/)).toBeVisible();
  await openSettingsCategory(desktopWindow, 'ReadwiseReader');
  await expect(desktopWindow.getByRole('button', { name: /^(Switching…|切换中…)$/ })).toHaveCount(0);
  const screenshot = await desktopWindow.screenshot({
    path: path.join(process.cwd(), '.tmp/artifacts/readwise-restore/retained-owner.png')
  });
  await info.attach('retained-readwise-owner', { body: screenshot, contentType: 'image/png' });
  await desktopWindow.reload();
  expect(await assignment(desktopWindow)).toMatchObject({ is_active: true, legacy_unassigned: false,
    handoff_pending: false });
  await expect(desktopWindow.getByRole('dialog', { name: /^(Readwise import device|Readwise 导入设备)$/ })).toHaveCount(0);
});
