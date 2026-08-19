import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const ARTIFACT_DIR = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance');
const WATCHED_PATH = path.join(process.cwd(), '.tmp/artifacts/t135-watched-source');

async function seedWorkgroupSourceFacts(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ app }, cwd) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    const libraryHome = process.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('missing isolated library home');
    const db = new Database(pathApi.join(libraryHome, 'Data', 'foliole.db'));
    const deviceRow = db.prepare("SELECT value FROM settings WHERE key = 'device_id'").get() as { value: string };
    const currentDeviceId = JSON.parse(deviceRow.value) as string;
    const run = (label: string, action: () => void) => {
      try {
        action();
      } catch (error) {
        throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    run('seed workgroup source facts', () => {
      db.prepare(`INSERT OR REPLACE INTO sync_groups
        (group_id, display_name, timeline_id, created_by_device_id, created_at, updated_at)
        VALUES ('t135-group', 'Workgroup', 't135-timeline', ?, 'now', 'now')`).run(currentDeviceId);
      const insertMember = db.prepare(`INSERT INTO sync_group_members
        (group_id, device_id, device_kind, device_name, state, approved_by_device_id,
         authorization_id, joined_at, updated_at)
        VALUES ('t135-group', ?, ?, ?, 'active', ?, ?, 'now', 'now')`);
      insertMember.run(currentDeviceId, 'darwin', 'This Mac', currentDeviceId, 't135-local-authorization');
      insertMember.run('t135-office-pc', 'win32', 'Office PC', currentDeviceId, 't135-remote-authorization');
      insertMember.run('t135-macbook', 'darwin', 'MacBook Pro', currentDeviceId, 't135-macbook-authorization');
      db.prepare(`INSERT OR REPLACE INTO sync_group_local_state
        (singleton_id, group_id, local_device_id, member_state, updated_at)
        VALUES (1, 't135-group', ?, 'active', 'now')`).run(currentDeviceId);
      db.prepare(`INSERT INTO watched_folder_bindings
        (binding_id, connected_device_id, connected_device_name, connected_platform, connection_status,
         action_mode, archive_path, highlight_mode, highlight_path, primary_path, created_at, updated_at)
        VALUES ('t135-remote-source', 't135-office-pc', 'Office PC', 'win32', 'connected',
          'keep', '', 'merged', '', 'D:\\Research', 'now', 'now')`).run();
      db.prepare(`INSERT INTO watched_folder_bindings
        (binding_id, connected_device_id, connected_device_name, connected_platform, connection_status,
         action_mode, archive_path, highlight_mode, highlight_path, primary_path, created_at, updated_at)
        VALUES ('t135-remote-projects', 't135-office-pc', 'Office PC', 'win32', 'connected',
          'keep', '', 'merged', '', 'D:\\Projects', 'now', 'now')`).run();
      db.prepare(`INSERT INTO watched_folder_bindings
        (binding_id, connected_device_id, connected_device_name, connected_platform, connection_status,
         action_mode, archive_path, highlight_mode, highlight_path, primary_path, created_at, updated_at)
        VALUES ('t135-remote-mac', 't135-macbook', 'MacBook Pro', 'darwin', 'connected',
          'keep', '', 'merged', '', '/Users/foliole/Documents/Research', 'now', 'now')`).run();
      db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES
        ('readwise_active_device', '{"device_id":"t135-office-pc"}', 'now')`).run();
    });
    db.close();
    return app.getPath('userData');
  }, process.cwd());
}

test('keeps watched and Readwise source connections explicit in desktop settings', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await seedWorkgroupSourceFacts(desktopApp);
  await mkdir(WATCHED_PATH, { recursive: true });
  const settings = createDefaultImportManagerSettings();
  settings.readwiseRootPath = 'D:\\Readwise Reader';
  settings.sources[0] = {
    ...settings.sources[0]!,
    id: 't135-watched-source',
    keepState: 'enabled',
    primaryPath: WATCHED_PATH
  };
  await desktopWindow.evaluate(async (nextSettings) => {
    await globalThis.window?.electronAPI?.invoke('save_import_manager_settings', { settings: nextSettings });
  }, settings);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const importDialog = await openSettingsCategory(desktopWindow, 'Import');
  const watchedRegion = importDialog.getByRole('region', {
    name: /^(Other devices|其他设备)$/
  });
  await expect(watchedRegion).toBeVisible();
  const remoteDevice = watchedRegion.getByRole('group', { name: 'Office PC' });
  await expect(remoteDevice.getByText('Windows', { exact: true })).toBeVisible();
  await expect(remoteDevice.getByText('D:\\Research', { exact: true })).toBeVisible();
  await expect(remoteDevice.getByText('D:\\Projects', { exact: true })).toBeVisible();
  await expect(remoteDevice.getByRole('button', { name: /^(More actions for Office PC|Office PC 的更多操作)$/ })).toBeVisible();
  const macDevice = watchedRegion.getByRole('group', { name: 'MacBook Pro' });
  await expect(macDevice.getByText('macOS', { exact: true })).toBeVisible();
  await expect(macDevice.getByText('/Users/foliole/Documents/Research', { exact: true })).toBeVisible();
  await expect(watchedRegion.getByRole('group', { name: 'This Mac' })).toHaveCount(0);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const watchedScreenshot = path.join(ARTIFACT_DIR, 't135-watched-source-connections.png');
  await importDialog.screenshot({ path: watchedScreenshot });
  await testInfo.attach('t135-watched-source-connections', { path: watchedScreenshot, contentType: 'image/png' });

  const readwiseDialog = await openSettingsCategory(desktopWindow, 'ReadwiseReader');
  const deviceRegion = readwiseDialog.getByRole('region', { name: /^(Current active device|当前生效设备)$/ });
  await expect(deviceRegion).toBeVisible();
  await expect(deviceRegion.getByText('Office PC', { exact: true })).toBeVisible();
  await expect(deviceRegion.getByText('Windows', { exact: true })).toBeVisible();
  await expect(deviceRegion.getByText('D:\\Readwise Reader', { exact: true })).toBeVisible();
  await expect(deviceRegion.getByText('This Mac', { exact: true })).toHaveCount(0);
  await expect(readwiseDialog.getByText(/^(Readwise Reader Import|Readwise Reader 导入)$/)).toHaveCount(0);
  const readwiseScreenshot = path.join(ARTIFACT_DIR, 't135-readwise-device-assignment.png');
  await readwiseDialog.screenshot({ path: readwiseScreenshot });
  await testInfo.attach('t135-readwise-device-assignment', { path: readwiseScreenshot, contentType: 'image/png' });
  const switchToThisDevice = deviceRegion.getByRole('button', { name: /^(Switch to this device|切换到本设备)$/ });
  await expect(switchToThisDevice).toBeVisible();
  await switchToThisDevice.click();
  await expect(switchToThisDevice).toHaveCount(0);
  await expect(readwiseDialog.getByText(/^(Readwise Reader Import|Readwise Reader 导入)$/)).toBeVisible();
});
