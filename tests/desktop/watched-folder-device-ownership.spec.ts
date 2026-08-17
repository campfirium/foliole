import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const IMPORT_HEADING = /^(Watched folders|监听文件夹)$/;
const originalFolder = (id: string) => new RegExp(`^(Original folder|原文文件夹) ${id}$`);
const disableKeep = (id: string) => new RegExp(`^(Disable keep import|停用持续导入) ${id}$`);

async function seedOwnedWatchedFolders(desktopApp: ElectronApplication) {
  const result = await desktopApp.evaluate(({ app }, cwd) => {
    const fsApi = process.getBuiltinModule('fs');
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!fsApi || !moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    const libraryHome = process.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('missing isolated library home');
    const identityPath = pathApi.join(app.getPath('userData'), 'desktop-installation.json');
    const identity = JSON.parse(fsApi.readFileSync(identityPath, 'utf8')) as {
      deviceName: string;
      installationId: string;
      platform: string;
    };
    try {
      const db = new Database(pathApi.join(libraryHome, 'Data', 'foliole.db'));
      db.pragma('busy_timeout = 5000');
      const now = '2026-08-17T00:00:00.000Z';
      db.prepare(`INSERT INTO source_ownership_cutover (singleton_id, status, cutover_at)
        VALUES (1, 'cutover', ?)
        ON CONFLICT(singleton_id) DO UPDATE SET status = 'cutover', cutover_at = excluded.cutover_at`).run(now);
      const insert = db.prepare(`INSERT INTO watched_folder_bindings (
        binding_id, owner_installation_id, owner_device_name, owner_platform, claim_state, claim_revision,
        action_mode, archive_path, highlight_mode, highlight_path, keep_preview_json, primary_path,
        enabled, availability, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, 'claimed', ?, 'keep', '', 'merged', '', NULL, ?, 1, 'available', ?, ?, NULL)`);
      insert.run('local-watched', identity.installationId, identity.deviceName, identity.platform,
        'local-revision', '/Users/local/Inbox', now, now);
      insert.run('remote-watched', 'desktop-windows', 'Windows PC', 'win32',
        'remote-revision', 'D:\\Inbox', now, now);
      db.close();
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, process.cwd());
  if (result.error) throw new Error(result.error);
}

test('groups watched folders by owner and keeps remote controls read only', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedOwnedWatchedFolders(desktopApp);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const settingsDialog = await openSettingsCategory(desktopWindow, 'Import');

  await expect(settingsDialog.getByRole('heading', { level: 2, name: IMPORT_HEADING })).toBeVisible();
  await expect(settingsDialog.getByRole('row', { name: 'Windows PC' })).toBeVisible();
  const remoteFolder = settingsDialog.getByRole('button', { name: originalFolder('remote-watched') });
  await expect(remoteFolder).toContainText('Inbox');
  await expect(remoteFolder).toBeDisabled();
  await expect(settingsDialog.getByRole('button', { name: disableKeep('remote-watched') })).toBeDisabled();
  await expect(settingsDialog.getByRole('button', { name: originalFolder('local-watched') })).toBeEnabled();
  await expect(settingsDialog.getByRole('button', { name: disableKeep('local-watched') })).toBeEnabled();
  await expect(settingsDialog.getByRole('status')).toHaveCount(0);

  const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'desktop-acceptance',
    'watched-folder-device-ownership-hidden-native.png');
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await settingsDialog.screenshot({ path: screenshotPath });
  await testInfo.attach('watched-folder-device-ownership', { path: screenshotPath, contentType: 'image/png' });
});
