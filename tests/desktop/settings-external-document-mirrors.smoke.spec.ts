import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const EXTERNAL_FOLDER_HEADING = /^(External folders|外部文件夹)$/;
const REMOTE_GROUP = /^(Other devices|其他设备)$/;

async function seedWorkgroup(desktopApp: ElectronApplication, activeWorkgroup: boolean) {
  await desktopApp.evaluate(async ({ app }, { activeWorkgroup, cwd }) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    await connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const deviceRow = driver.queryOne("SELECT value FROM settings WHERE key = 'device_id'") as { value: string };
      const currentDeviceId = JSON.parse(deviceRow.value) as string;
      driver.execute(`INSERT OR REPLACE INTO sync_groups
        (group_id, display_name, timeline_id, created_by_device_id, created_at, updated_at)
        VALUES ('external-folders-group', 'Workgroup', 'external-folders-timeline', ?, 'now', 'now')`,
      [currentDeviceId]);
      const insertMember = (values: string[]) => driver.execute(`INSERT OR REPLACE INTO sync_group_members
        (group_id, device_id, device_kind, device_name, state, approved_by_device_id,
         authorization_id, joined_at, updated_at)
        VALUES ('external-folders-group', ?, ?, ?, ?, ?, ?, 'now', 'now')`, values);
      insertMember([currentDeviceId, 'darwin', 'This Mac', activeWorkgroup ? 'active' : 'left',
        currentDeviceId, 'external-local-auth']);
      insertMember(['other-desktop', 'win32', 'Windows PC', 'active', currentDeviceId, 'external-windows-auth']);
      insertMember(['other-mac', 'darwin', 'MacBook Pro', 'active', currentDeviceId, 'external-mac-auth']);
      if (activeWorkgroup) {
        driver.execute(`INSERT OR REPLACE INTO sync_group_local_state
          (singleton_id, group_id, local_device_id, member_state, updated_at)
          VALUES (1, 'external-folders-group', ?, 'active', 'now')`, [currentDeviceId]);
      } else {
        driver.execute(`UPDATE sync_group_members SET left_at = 'now'
          WHERE group_id = 'external-folders-group' AND device_id = ?`, [currentDeviceId]);
      }
    });
    return app.getPath('userData');
  }, { activeWorkgroup, cwd: process.cwd() });
}

async function seedRemoteMirror(desktopApp: ElectronApplication, activeWorkgroup = true) {
  await seedWorkgroup(desktopApp, activeWorkgroup);
  await desktopApp.evaluate(async ({ app }, cwd) => {
    const fsApi = process.getBuiltinModule('fs');
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!fsApi || !moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const libraryHome = process.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('missing isolated library home');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    await connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const insertRemoteFolder = (values: Array<number | string | null>) => driver.execute(
        `INSERT OR REPLACE INTO external_search_folders (
          id, folder_path, attachment_mode, owner_installation_id, owner_device_name, owner_platform,
          status, document_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values
      );
      insertRemoteFolder(['playwright-remote-folder', 'D:\\X\\Dropbox\\obs\\1act\\0cap', 'document_relative',
        'other-desktop', 'Windows PC', 'win32', 'ready', 21,
        '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z']);
      insertRemoteFolder(['playwright-remote-projects', 'D:\\Projects', 'document_relative',
      'other-desktop', 'Windows PC', 'win32', 'ready', 8,
      '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z']);
      insertRemoteFolder(['playwright-remote-research', '/Users/foliole/Documents/Research', 'document_relative',
      'other-mac', 'MacBook Pro', 'darwin', 'ready', 5,
      '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z']);
      insertRemoteFolder(['playwright-waiting-folder', '/Users/foliole/Documents/Waiting', 'document_relative',
      null, 'This Mac', 'darwin', 'idle', 3,
      '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z']);
      const openedPath = pathApi.join(libraryHome, 'opened-test.md');
      fsApi.writeFileSync(openedPath, '# Opened test\n', 'utf8');
      driver.execute(`INSERT OR REPLACE INTO local_files
        (id, absolute_path, title, file_size, modified_at, last_opened_at, missing_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`, ['playwright-opened-file', openedPath, 'opened-test.md', 14,
        '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z',
        '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z']);
    });
    return app.getPath('userData');
  }, process.cwd());
}

test.describe('desktop settings External folders', () => {
  test('settings exposes External folders copy', async ({ desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    const settingsDialog = await openSettingsCategory(desktopWindow, 'ExternalFolder');

    await expect(settingsDialog.getByRole('heading', { level: 2, name: EXTERNAL_FOLDER_HEADING })).toBeVisible();
  });

  test('keeps remote folders hidden after leaving the workgroup', async ({ desktopApp, desktopWindow }) => {
    await seedRemoteMirror(desktopApp, false);
    await desktopWindow.reload();
    await expectWorkspaceShell(desktopWindow);
    const settingsDialog = await openSettingsCategory(desktopWindow, 'ExternalFolder');

    await expect(settingsDialog.getByRole('region', { name: REMOTE_GROUP })).toHaveCount(0);
    await expect(settingsDialog.getByText('Windows PC', { exact: true })).toHaveCount(0);
    await expect(settingsDialog.getByRole('button', { name: /^(Add folder|添加文件夹)$/ })).toBeVisible();
  });

  test('shows a remote desktop mirror above editable local folders', async ({ desktopApp, desktopWindow }, testInfo) => {
    await expectWorkspaceShell(desktopWindow);
    await seedRemoteMirror(desktopApp);
    await desktopWindow.reload();
    await expectWorkspaceShell(desktopWindow);
    const settingsDialog = await openSettingsCategory(desktopWindow, 'ExternalFolder');

    const remoteRegion = settingsDialog.getByRole('region', { name: REMOTE_GROUP });
    const pageHeading = settingsDialog.getByRole('heading', { level: 2, name: EXTERNAL_FOLDER_HEADING });
    await expect(remoteRegion).toBeVisible();
    await expect(pageHeading).toBeVisible();
    const remoteBounds = await remoteRegion.boundingBox();
    const pageHeadingBounds = await pageHeading.boundingBox();
    expect(remoteBounds).not.toBeNull();
    expect(pageHeadingBounds).not.toBeNull();
    expect(pageHeadingBounds?.y).toBeLessThan(remoteBounds?.y ?? 0);
    await expect(remoteRegion.getByText(/^(Path|路径)$/)).toBeVisible();
    await expect(settingsDialog.getByText('Windows PC', { exact: true })).toBeVisible();
    await expect(settingsDialog.getByText('D:\\X\\Dropbox\\obs\\1act\\0cap')).toBeVisible();
    await expect(settingsDialog.getByText('D:\\Projects', { exact: true })).toBeVisible();
    await expect(settingsDialog.getByText('MacBook Pro', { exact: true })).toBeVisible();
    await expect(settingsDialog.getByText('/Users/foliole/Documents/Waiting', { exact: true })).toBeVisible();
    await expect(settingsDialog.getByText(/^(Waiting to reconnect|待连接)$/)).toBeVisible();
    await expect(settingsDialog.getByText('This Mac', { exact: true })).toHaveCount(0);
    await expect(settingsDialog.getByText(/^(Read-only mirror|只读镜像)$/)).toHaveCount(0);
    await expect(settingsDialog.getByText('Local', { exact: true })).toHaveCount(0);
    await expect(settingsDialog.getByRole('button', { name: /^(Add folder|添加文件夹)$/ })).toBeVisible();
    await expect(settingsDialog.getByRole('checkbox')).toHaveCount(0);
    await expect(settingsDialog.getByRole('switch')).toHaveCount(0);
    const waitingActions = settingsDialog.getByRole('button', {
      name: /^(More actions for \/Users\/foliole\/Documents\/Waiting|\/Users\/foliole\/Documents\/Waiting 的更多操作)$/
    });
    await expect(waitingActions).toBeVisible();
    await waitingActions.click();
    await expect(desktopWindow.getByRole('menuitem', { name: /^(Change source…|更换源…)$/ })).toBeVisible();
    await expect(desktopWindow.getByRole('menuitem', { name: /^(Remove source|移除源)$/ })).toBeVisible();

    const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'desktop-acceptance',
      'external-folder-remote-mirrors-hidden-native.png');
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await settingsDialog.screenshot({ path: screenshotPath });
    await testInfo.attach('external-folder-remote-mirrors', { path: screenshotPath, contentType: 'image/png' });
  });
});
