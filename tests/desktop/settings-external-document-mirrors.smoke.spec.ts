import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const EXTERNAL_FOLDER_HEADING = /^(External folders|外部文件夹)$/;
const REMOTE_GROUP = /^(Other hosts|其他主机)$/;

async function seedWorkgroup(desktopApp: ElectronApplication, activeWorkgroup: boolean) {
  await desktopApp.evaluate(async ({ app }, { activeWorkgroup, cwd }) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    await connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const currentHost = 'This Mac';
      driver.execute(`INSERT OR REPLACE INTO sync_groups
        (group_id, display_name, timeline_id, created_by_host_name, created_at, updated_at)
        VALUES ('external-folders-group', 'Workgroup', 'external-folders-timeline', ?, 'now', 'now')`,
      [currentHost]);
      const insertMember = (values: string[]) => driver.execute(`INSERT OR REPLACE INTO sync_group_members
        (group_id, host_name, host_platform, state, approved_by_host_name,
         authorization_id, joined_at, updated_at)
        VALUES ('external-folders-group', ?, ?, ?, ?, ?, 'now', 'now')`, values);
      insertMember([currentHost, 'darwin', activeWorkgroup ? 'active' : 'left',
        currentHost, 'external-local-auth']);
      insertMember(['Windows PC', 'win32', 'active', currentHost, 'external-windows-auth']);
      insertMember(['MacBook Pro', 'darwin', 'active', currentHost, 'external-mac-auth']);
      if (activeWorkgroup) {
        driver.execute(`INSERT OR REPLACE INTO sync_group_local_state
          (singleton_id, group_id, local_host_name, member_state, updated_at)
          VALUES (1, 'external-folders-group', ?, 'active', 'now')`, [currentHost]);
      } else {
        driver.execute(`UPDATE sync_group_members SET left_at = 'now'
          WHERE group_id = 'external-folders-group' AND host_name = ?`, [currentHost]);
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
      const at = '2026-07-24T00:00:00.000Z';
      const insertRemoteFolder = (source: {
        count: number; host: string; id: string; path: string; platform: string; status: string;
      }) => {
        const sourceRef = `external:${source.id}`;
        const pathFlavor = source.platform === 'win32' ? 'windows' : 'posix';
        driver.execute(`INSERT OR REPLACE INTO desktop_sources
          (source_ref, source_type, config_ref, host_name, host_platform, root_path,
           path_flavor, type_settings_json, created_at, updated_at)
          VALUES (?, 'external', ?, ?, ?, ?, ?, '{}', ?, ?)`,
        [sourceRef, source.id, source.host, source.platform, source.path, pathFlavor, at, at]);
        driver.execute(
        `INSERT OR REPLACE INTO external_search_folders (
          id, folder_path, attachment_mode, status, document_count, created_at, updated_at, source_ref)
        VALUES (?, ?, 'document_relative', ?, ?, ?, ?, ?)`,
        [source.id, source.path, source.status, source.count, at, at, sourceRef]);
        const nodeId = `topic-${source.id}`;
        driver.execute(`INSERT OR REPLACE INTO nodes
          (id, parent_id, kind, title, content, created_at, updated_at)
          VALUES (?, NULL, 'topic', ?, 'Body', ?, ?)`, [nodeId, source.id, at, at]);
        driver.execute(`INSERT OR REPLACE INTO import_sources (
          source_fingerprint, provider, source_kind, source_name, source_locator,
          first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id,
          source_ref, source_location
        ) VALUES (?, 'desktop_text_file', 'markdown', 'topic.md', ?, ?, ?, ?, ?, ?, 'topic.md')`,
        [`fingerprint-${source.id}`, source.path, at, at, `hash-${source.id}`, nodeId, sourceRef]);
      };
      insertRemoteFolder({ count: 21, host: 'Windows PC', id: 'playwright-remote-folder',
        path: 'D:\\X\\Dropbox\\obs\\1act\\0cap', platform: 'win32', status: 'ready' });
      insertRemoteFolder({ count: 8, host: 'Windows PC', id: 'playwright-remote-projects',
        path: 'D:\\Projects', platform: 'win32', status: 'ready' });
      insertRemoteFolder({ count: 5, host: 'MacBook Pro', id: 'playwright-remote-research',
        path: '/Users/foliole/Documents/Research', platform: 'darwin', status: 'ready' });
      insertRemoteFolder({ count: 3, host: 'This Mac', id: 'playwright-waiting-folder',
        path: '/Users/foliole/Documents/Waiting', platform: 'darwin', status: 'idle' });
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
    await expect(remoteRegion.getByRole('group', { name: 'This Mac' })).toBeVisible();
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

test.describe('desktop External Source management', () => {
  test('previews, cancels, and confirms an atomic Host replacement with recovery controls', async ({
    desktopApp, desktopWindow
  }, testInfo) => {
    await seedRemoteMirror(desktopApp);
    await desktopWindow.reload();
    await expectWorkspaceShell(desktopWindow);
    const settingsDialog = await openSettingsCategory(desktopWindow, 'ExternalFolder');
    const hostActions = settingsDialog.getByRole('button', {
      name: /^(More actions for Windows PC|Windows PC 的更多操作)$/
    });

    await hostActions.click();
    await desktopWindow.getByRole('menuitem', { name: /^(Replace host…|替换主机…)$/ }).click();
    let dialog = desktopWindow.getByRole('dialog');
    await expect(dialog).toContainText('D:\\X\\Dropbox\\obs\\1act\\0cap');
    await expect(dialog).toContainText('D:\\Projects');
    await expect(dialog).toContainText(/(2 sources and 2 existing topics|2 个来源和 2 个已有主题)/);
    await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();

    const canceled = await desktopWindow.evaluate(() => window.electronAPI?.invoke('preview_source_management', {
      action: 'replace_host', host_name: 'Windows PC', source_type: 'external'
    })) as { source_count: number };
    expect(canceled.source_count).toBe(2);

    await hostActions.click();
    await desktopWindow.getByRole('menuitem', { name: /^(Replace host…|替换主机…)$/ }).click();
    dialog = desktopWindow.getByRole('dialog');
    await dialog.getByRole('button', { name: /^(Replace host|替换主机)$/ }).click();
    await expect(settingsDialog.getByText('Windows PC', { exact: true })).toHaveCount(0);
    await expect(settingsDialog.getByText('D:\\X\\Dropbox\\obs\\1act\\0cap')).toBeVisible();
    await expect(settingsDialog.getByText('D:\\Projects', { exact: true })).toBeVisible();

    const folders = await desktopWindow.evaluate(() => window.electronAPI?.invoke('load_external_search_folders')) as Array<{
      access_mode: string; id: string; source_executable: boolean; source_host_name: string;
    }>;
    expect(folders.filter((folder) => folder.id.startsWith('playwright-remote-'))).toEqual([
      expect.objectContaining({ access_mode: 'local', source_executable: false, source_host_name: 'This Mac' }),
      expect.objectContaining({ access_mode: 'local', source_executable: false, source_host_name: 'This Mac' })
    ]);

    const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'desktop-acceptance',
      't135-20-source-host-replacement-hidden-native.png');
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await settingsDialog.screenshot({ path: screenshotPath });
    await testInfo.attach('source-host-replacement', { path: screenshotPath, contentType: 'image/png' });
  });
});
