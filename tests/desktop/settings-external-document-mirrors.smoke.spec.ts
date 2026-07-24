import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const EXTERNAL_FOLDER_HEADING = /^(External folders|外部文件夹)$/;
const REMOTE_GROUP = /^(From other devices|来自其他设备)$/;

async function seedRemoteMirror(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ app }, cwd) => {
    const fsApi = process.getBuiltinModule('fs');
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!fsApi || !moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    const libraryHome = process.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('missing isolated library home');
    const db = new Database(pathApi.join(libraryHome, 'Data', 'foliole.db'));
    const insertRemoteFolder = db.prepare(`INSERT INTO external_search_folders (
      id, folder_path, attachment_mode, owner_installation_id, owner_device_name, owner_platform,
      status, document_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertRemoteFolder
      .run('playwright-remote-folder', 'D:\\X\\Dropbox\\obs\\1act\\0cap', 'document_relative',
        'other-desktop', 'Windows PC', 'win32', 'ready', 21,
        '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z');
    insertRemoteFolder.run('playwright-remote-projects', 'D:\\Projects', 'document_relative',
      'other-desktop', 'Windows PC', 'win32', 'ready', 8,
      '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z');
    insertRemoteFolder.run('playwright-remote-research', '/Users/foliole/Documents/Research', 'document_relative',
      'other-mac', 'MacBook Pro', 'darwin', 'ready', 5,
      '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z');
    const openedPath = pathApi.join(libraryHome, 'opened-test.md');
    fsApi.writeFileSync(openedPath, '# Opened test\n', 'utf8');
    db.prepare('INSERT INTO local_files (id, absolute_path, title, file_size, modified_at, last_opened_at, missing_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)')
      .run('playwright-opened-file', openedPath, 'opened-test.md', 14,
        '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z',
        '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z');
    db.close();
    return app.getPath('userData');
  }, process.cwd());
}

test.describe('desktop settings External folders', () => {
  test('settings exposes External folders copy', async ({ desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    const settingsDialog = await openSettingsCategory(desktopWindow, 'ExternalFolder');

    await expect(settingsDialog.getByRole('heading', { level: 2, name: EXTERNAL_FOLDER_HEADING })).toBeVisible();
  });

  test('shows a remote desktop mirror above editable local folders', async ({ desktopApp, desktopWindow }, testInfo) => {
    await expectWorkspaceShell(desktopWindow);
    await seedRemoteMirror(desktopApp);
    const settingsDialog = await openSettingsCategory(desktopWindow, 'ExternalFolder');

    const remoteRegion = settingsDialog.getByRole('region', { name: REMOTE_GROUP });
    const localSectionHeading = settingsDialog.getByRole('heading', { level: 3, name: EXTERNAL_FOLDER_HEADING });
    await expect(remoteRegion).toBeVisible();
    await expect(localSectionHeading).toBeVisible();
    const remoteBounds = await remoteRegion.boundingBox();
    const localHeadingBounds = await localSectionHeading.boundingBox();
    expect(remoteBounds).not.toBeNull();
    expect(localHeadingBounds).not.toBeNull();
    expect(remoteBounds?.y).toBeLessThan(localHeadingBounds?.y ?? 0);
    await expect(settingsDialog.getByText(/Browse and search these folders|在此设备浏览和搜索这些文件夹/)).toBeVisible();
    await expect(settingsDialog.getByText('Windows PC', { exact: true })).toBeVisible();
    await expect(settingsDialog.getByText('Windows', { exact: true })).toBeVisible();
    await expect(settingsDialog.getByText('0cap', { exact: true })).toBeVisible();
    await expect(settingsDialog.getByText('D:\\X\\Dropbox\\obs\\1act\\0cap')).toBeVisible();
    await expect(settingsDialog.getByText('Projects', { exact: true })).toBeVisible();
    await expect(settingsDialog.getByText('MacBook Pro', { exact: true })).toBeVisible();
    await expect(settingsDialog.getByText('macOS', { exact: true })).toBeVisible();
    await expect(settingsDialog.getByText(/^(Read-only mirror|只读镜像)$/)).toHaveCount(0);
    await expect(settingsDialog.getByText('Local', { exact: true })).toHaveCount(0);
    await expect(settingsDialog.getByRole('button', { name: /^(Add folder|添加文件夹)$/ })).toBeVisible();

    const groupEnabled = settingsDialog.getByRole('checkbox', { name: /Windows PC/ });
    const projectsEnabled = settingsDialog.getByRole('switch', { name: /Projects/ });
    await expect(groupEnabled).toHaveAttribute('aria-checked', 'true');
    await projectsEnabled.click();
    await expect(groupEnabled).toHaveAttribute('aria-checked', 'mixed');
    await groupEnabled.click();
    await expect(groupEnabled).toHaveAttribute('aria-checked', 'true');
    const folderEnabled = settingsDialog.getByRole('switch', { name: /0cap/ });
    await expect(folderEnabled).toHaveAttribute('aria-checked', 'true');

    const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'desktop-acceptance',
      'external-folder-remote-mirrors-hidden-native.png');
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await settingsDialog.screenshot({ path: screenshotPath });
    await testInfo.attach('external-folder-remote-mirrors', { path: screenshotPath, contentType: 'image/png' });

    await folderEnabled.click();
    await expect(groupEnabled).toHaveAttribute('aria-checked', 'mixed');
  });
});
