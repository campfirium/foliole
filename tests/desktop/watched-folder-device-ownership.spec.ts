import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const IMPORT_HEADING = /^(Watched folders|监听文件夹)$/;
const originalFolder = (id: string) => new RegExp(`^(Original folder|原文文件夹) ${id}$`);
const disableKeep = (id: string) => new RegExp(`^(Disable keep import|停用持续导入) ${id}$`);

async function seedOwnedWatchedFolders(databasePath: string, identityPath: string) {
  const identity = JSON.parse(await fs.readFile(identityPath, 'utf8')) as {
    deviceName: string; installationId: string; platform: string;
  };
  const db = new DatabaseSync(databasePath);
  const now = '2026-08-17T00:00:00.000Z';
  db.prepare(`INSERT INTO source_ownership_cutover (singleton_id, status, cutover_at)
    VALUES (1, 'cutover', ?)
    ON CONFLICT(singleton_id) DO UPDATE SET status = 'cutover', cutover_at = excluded.cutover_at`).run(now);
  const insert = db.prepare(`INSERT INTO watched_folder_bindings (
    binding_id, owner_installation_id, owner_device_name, owner_platform, claim_state, claim_revision,
    action_mode, archive_path, highlight_mode, highlight_path, keep_preview_json, primary_path,
    enabled, availability, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, 'claimed', ?, 'keep', '', 'merged', '', NULL, ?, 1, 'available', ?, ?, NULL)`);
  insert.run('local-watched', identity.installationId, identity.deviceName, identity.platform,
    'local-revision', '/Users/local/Inbox', now, now);
  insert.run('remote-watched', 'desktop-windows', 'Windows PC', 'win32',
    'remote-revision', 'D:\\Inbox', now, now);
  db.close();
}

test('groups watched folders by owner and keeps remote controls read only', async ({
  desktopSession
}, testInfo) => {
  let restartedSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('missing isolated library home');
    const userData = await desktopSession.electronApp.evaluate(({ app }) => app.getPath('userData'));
    await desktopSession.electronApp.close();
    await seedOwnedWatchedFolders(
      path.join(libraryHome, 'Data', 'foliole.db'),
      path.join(userData, 'desktop-installation.json')
    );
    restartedSession = await launchDesktopSession({ env: desktopSession.launchOptions.env });
    const desktopPage = restartedSession.firstWindow;
    await expectWorkspaceShell(desktopPage);
    const settingsDialog = await openSettingsCategory(desktopPage, 'Import');

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
  } finally {
    await restartedSession?.close();
  }
});
