import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Locator, Page, TestInfo } from '@playwright/test';

import {
  applyReadwiseRootPath,
  createDefaultImportManagerSettings
} from '../../lib/core/import/importManagerSettings';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const ARTIFACT_DIR = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance');
const READWISE_ROOT = 'D:\\Readwise Reader';

async function seedRemoteActiveHost(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(async ({ app }, cwd) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    await connection.runWithDatabaseConnectionOwner(() => {
      connection.openDatabaseConnection().sqlite.exec(`
        INSERT OR REPLACE INTO sync_groups
          (group_id, display_name, timeline_id, created_by_host_name, created_at, updated_at)
          VALUES ('t135-19-group', 'Workgroup', 't135-19-timeline', 'This Mac', 'now', 'now');
        INSERT OR REPLACE INTO sync_group_members
          (group_id, host_name, host_platform, state, approved_by_host_name,
           authorization_id, joined_at, updated_at)
          VALUES
          ('t135-19-group', 'This Mac', 'darwin', 'active', 'This Mac', 'local-auth', 'now', 'now'),
          ('t135-19-group', 'Office PC', 'win32', 'active', 'This Mac', 'remote-auth', 'now', 'now');
        INSERT OR REPLACE INTO sync_group_local_state
          (singleton_id, group_id, local_host_name, member_state, updated_at)
          VALUES (1, 't135-19-group', 'This Mac', 'active', 'now');
        INSERT OR REPLACE INTO settings (key, value, updated_at)
          VALUES ('readwise_active_host', '{"host_name":"Office PC"}', 'now');
      `);
    });
    return app.getPath('userData');
  }, process.cwd());
}

async function capture(dialog: Locator, testInfo: TestInfo, name: string) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const screenshot = path.join(ARTIFACT_DIR, `${name}.png`);
  await dialog.screenshot({ path: screenshot });
  await testInfo.attach(name, { contentType: 'image/png', path: screenshot });
}

async function expectLocalSettingsRestored(page: Page, dialog: Locator, testInfo: TestInfo) {
  await expect(dialog.getByText(/^(Readwise Reader Import|Readwise Reader 导入)$/)).toBeVisible();
  const rootFolder = dialog.getByRole('button', { name: /^(Readwise root folder|Readwise 根文件夹)$/ });
  await rootFolder.hover();
  await expect(page.getByRole('tooltip')).toHaveText(READWISE_ROOT);
  await capture(dialog, testInfo, 't135-19-readwise-local-restored');
}

test('keeps Readwise settings private to their Host when active ownership changes', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  const settings = createDefaultImportManagerSettings();
  settings.readwiseRootPath = READWISE_ROOT;
  settings.readwiseSources = applyReadwiseRootPath(settings.readwiseSources, READWISE_ROOT);
  await desktopWindow.evaluate(async (nextSettings) => {
    await globalThis.window?.electronAPI?.invoke('save_import_manager_settings', { settings: nextSettings });
  }, settings);
  await seedRemoteActiveHost(desktopApp);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const dialog = await openSettingsCategory(desktopWindow, 'ReadwiseReader');
  const hostRegion = dialog.getByRole('region', { name: /^(Current active host|当前生效主机)$/ });
  await expect(hostRegion.getByText('Office PC', { exact: true })).toBeVisible();
  await expect(hostRegion.getByText('Windows', { exact: true })).toBeVisible();
  await expect(dialog.getByText(READWISE_ROOT, { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/^(Readwise Reader Import|Readwise Reader 导入)$/)).toHaveCount(0);
  await capture(dialog, testInfo, 't135-19-readwise-remote-private');

  const switchToThisHost = hostRegion.getByRole('button', { name: /^(Switch to this host|切换到此主机)$/ });
  await switchToThisHost.click();
  await expect(switchToThisHost).toHaveCount(0);
  await expectLocalSettingsRestored(desktopWindow, dialog, testInfo);
});
