import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openBackupsSection } from './harness/settings';

const RESTORE = /^(Restore|恢复)$/;
const DONE = /^(Done|完成)$/;

test('reports failed and successful database restores through the native bridge', async ({ desktopSession, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  if (!libraryHome) throw new Error('Missing isolated Library home.');
  const backupDir = path.join(libraryHome, 'restore-feedback');
  await mkdir(backupDir, { recursive: true });
  await desktopWindow.evaluate(async (directory) => {
    await window.electronAPI.invoke('save_backup_settings', { settings: { backup_dir: directory } });
  }, backupDir);
  const backup = await desktopWindow.evaluate(async () =>
    window.electronAPI.invoke('backup_sqlite_database', {})) as { destinationPath: string };
  const invalidName = 'foliole-manual-261002-230000.db';
  await writeFile(path.join(backupDir, invalidName), 'invalid sqlite backup');
  const settings = await openBackupsSection(desktopWindow);
  await settings.locator('[data-settings-row]').filter({ has: desktopWindow.getByRole('heading', { name: invalidName }) })
    .getByRole('button', { name: RESTORE }).click();
  const failure = desktopWindow.getByRole('dialog', { name: /^(Backup not restored|备份未恢复)$/ });
  await expect(failure).toBeVisible();
  await expect(failure).toContainText(/Your current library is unchanged|当前资料库保持原状/);
  await failure.screenshot({ path: testInfo.outputPath('restore-failure.png') });
  await testInfo.attach('restore-failure', { path: testInfo.outputPath('restore-failure.png'), contentType: 'image/png' });
  await failure.getByRole('button', { name: DONE }).click();

  await settings.locator('[data-settings-row]').filter({ has: desktopWindow.getByRole('heading', { name: path.basename(backup.destinationPath) }) })
    .getByRole('button', { name: RESTORE }).click();
  const success = desktopWindow.getByRole('dialog', { name: /^(Backup restored|备份已恢复)$/ });
  await expect(success).toBeVisible();
  await expect(success).toContainText(path.basename(backup.destinationPath));
  await success.screenshot({ path: testInfo.outputPath('restore-success.png') });
  await testInfo.attach('restore-success', { path: testInfo.outputPath('restore-success.png'), contentType: 'image/png' });
  await success.getByRole('button', { name: DONE }).click();
  await expectWorkspaceShell(desktopWindow);
});
