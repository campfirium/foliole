import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const EXTERNAL_FOLDER_HEADING = /^(External folders|外部文件夹)$/;
const REMOTE_GROUP = /^(From your other devices|来自其他设备)$/;

async function seedRemoteMirror(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ app }, cwd) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    const libraryHome = process.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('missing isolated library home');
    const db = new Database(pathApi.join(libraryHome, 'Data', 'foliole.db'));
    db.prepare(`INSERT INTO external_search_folders (
      id, folder_path, attachment_mode, owner_installation_id, owner_device_name, owner_platform,
      status, document_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('playwright-remote-folder', 'D:\\Notes', 'document_relative', 'other-desktop', 'Windows PC',
        'win32', 'ready', 1, '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z');
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

    await expect(settingsDialog.getByRole('region', { name: REMOTE_GROUP })).toBeVisible();
    await expect(settingsDialog.getByText('Notes · Windows PC')).toBeVisible();
    await expect(settingsDialog.getByText('D:\\Notes')).toBeVisible();
    await expect(settingsDialog.getByText(/^(Read-only mirror|只读镜像)$/)).toBeVisible();
    const enabled = settingsDialog.getByRole('checkbox', { name: /Windows PC/ });
    await expect(enabled).toBeChecked();
    await enabled.uncheck();
    await expect(enabled).not.toBeChecked();

    const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'desktop-acceptance',
      'external-folder-remote-mirrors-hidden-native.png');
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await settingsDialog.screenshot({ path: screenshotPath });
    await testInfo.attach('external-folder-remote-mirrors', { path: screenshotPath, contentType: 'image/png' });
  });
});
