import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import {
  applyReadwiseRootPath,
  createDefaultImportManagerSettings
} from '../../lib/core/import/importManagerSettings';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const ARTIFACT_DIR = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance');
const WATCHED_PATH = path.join(process.cwd(), '.tmp/artifacts/t135-watched-source');

async function seedWorkgroupSourceFacts(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(async ({ app }, cwd) => {
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
        VALUES ('t135-group', 'Workgroup', 't135-timeline', ?, 'now', 'now')`, [currentHost]);
      const insertMember = (values: string[]) => driver.execute(`INSERT INTO sync_group_members
        (group_id, host_name, host_platform, state, approved_by_host_name,
         authorization_id, joined_at, updated_at)
        VALUES ('t135-group', ?, ?, 'active', ?, ?, 'now', 'now')`, values);
      insertMember([currentHost, 'darwin', currentHost, 't135-local-authorization']);
      insertMember(['Office PC', 'win32', currentHost, 't135-remote-authorization']);
      insertMember(['MacBook Pro', 'darwin', currentHost, 't135-macbook-authorization']);
      driver.execute(`INSERT OR REPLACE INTO sync_group_local_state
        (singleton_id, group_id, local_host_name, member_state, updated_at)
        VALUES (1, 't135-group', ?, 'active', 'now')`, [currentHost]);
      const insertBinding = (values: string[]) => {
        driver.execute(`INSERT INTO desktop_sources
          (source_ref, source_type, config_ref, host_name, host_platform, root_path,
           path_flavor, type_settings_json, created_at, updated_at)
          VALUES (?, 'watched', ?, ?, ?, ?, ?, '{}', 'now', 'now')`, values);
        driver.execute(`INSERT INTO watched_folder_bindings
          (binding_id, connection_status, action_mode, archive_path, highlight_mode,
           highlight_path, primary_path, created_at, updated_at, source_ref)
          VALUES (?, 'connected', 'keep', '', 'merged', '', ?, 'now', 'now', ?)`,
        [values[1], values[4], values[0]]);
      };
      insertBinding(['watched:t135-remote-source', 't135-remote-source', 'Office PC', 'win32',
        'D:\\Research', 'windows']);
      insertBinding(['watched:t135-remote-projects', 't135-remote-projects', 'Office PC', 'win32',
        'D:\\Projects', 'windows']);
      insertBinding(['watched:t135-remote-mac', 't135-remote-mac', 'MacBook Pro', 'darwin',
        '/Users/foliole/Documents/Research', 'posix']);
      driver.execute(`INSERT INTO settings (key, value, updated_at) VALUES
        ('readwise_active_host', '{"host_name":"Office PC"}', 'now')`);
    });
    return app.getPath('userData');
  }, process.cwd());
}

async function assignReadwiseSourcesToOfficeHost(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(async ({ app }, cwd) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    await connection.runWithDatabaseConnectionOwner(() => {
      connection.openDatabaseConnection().driver.execute(
        "UPDATE desktop_sources SET host_name = 'Office PC', host_platform = 'win32' WHERE source_type = 'readwise'"
      );
    });
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
  settings.readwiseSources = applyReadwiseRootPath(settings.readwiseSources, settings.readwiseRootPath);
  settings.sources[0] = {
    ...settings.sources[0]!,
    id: 't135-watched-source',
    keepState: 'enabled',
    primaryPath: WATCHED_PATH
  };
  await desktopWindow.evaluate(async (nextSettings) => {
    await globalThis.window?.electronAPI?.invoke('save_import_manager_settings', { settings: nextSettings });
  }, settings);
  await assignReadwiseSourcesToOfficeHost(desktopApp);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const importDialog = await openSettingsCategory(desktopWindow, 'Import');
  const watchedRegion = importDialog.getByRole('region', {
    name: /^(Other hosts|其他主机)$/
  });
  await expect(watchedRegion).toBeVisible();
  const remoteHost = watchedRegion.getByRole('group', { name: 'Office PC' });
  await expect(remoteHost.getByText('Windows', { exact: true })).toBeVisible();
  await expect(remoteHost.getByText('D:\\Research', { exact: true })).toBeVisible();
  await expect(remoteHost.getByText('D:\\Projects', { exact: true })).toBeVisible();
  await expect(remoteHost.getByRole('button', { name: /^(More actions for Office PC|Office PC 的更多操作)$/ })).toBeVisible();
  const macHost = watchedRegion.getByRole('group', { name: 'MacBook Pro' });
  await expect(macHost.getByText('macOS', { exact: true })).toBeVisible();
  await expect(macHost.getByText('/Users/foliole/Documents/Research', { exact: true })).toBeVisible();
  await expect(watchedRegion.getByRole('group', { name: 'This Mac' })).toHaveCount(0);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const watchedScreenshot = path.join(ARTIFACT_DIR, 't135-watched-source-connections.png');
  await importDialog.screenshot({ path: watchedScreenshot });
  await testInfo.attach('t135-watched-source-connections', { path: watchedScreenshot, contentType: 'image/png' });

  const readwiseDialog = await openSettingsCategory(desktopWindow, 'ReadwiseReader');
  const hostRegion = readwiseDialog.getByRole('region', { name: /^(Current active host|当前生效主机)$/ });
  await expect(hostRegion).toBeVisible();
  await expect(hostRegion.getByText('Office PC', { exact: true })).toBeVisible();
  await expect(hostRegion.getByText('Windows', { exact: true })).toBeVisible();
  await expect(hostRegion.getByText('D:\\Readwise Reader', { exact: true })).toBeVisible();
  await expect(hostRegion.getByText('This Mac', { exact: true })).toHaveCount(0);
  await expect(readwiseDialog.getByText(/^(Readwise Reader Import|Readwise Reader 导入)$/)).toHaveCount(0);
  const readwiseScreenshot = path.join(ARTIFACT_DIR, 't135-readwise-host-assignment.png');
  await readwiseDialog.screenshot({ path: readwiseScreenshot });
  await testInfo.attach('t135-readwise-host-assignment', { path: readwiseScreenshot, contentType: 'image/png' });
  const switchToThisHost = hostRegion.getByRole('button', { name: /^(Switch to this host|切换到此主机)$/ });
  await expect(switchToThisHost).toBeVisible();
  await switchToThisHost.click();
  await expect(switchToThisHost).toHaveCount(0);
  await expect(readwiseDialog.getByText(/^(Readwise Reader Import|Readwise Reader 导入)$/)).toBeVisible();
});
