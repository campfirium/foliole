import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openBackupsSection } from './harness/settings';

test('keeps a foreign backup path visible and lets the user explicitly restore the local default', async ({ desktopApp, desktopWindow, desktopSession }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const foreignPath = process.platform === 'win32' ? '/Volumes/Other/Backups' : 'D:\\Other\\Backups';
  await desktopApp.evaluate(({ app }, value) => {
    const pathApi = process.getBuiltinModule('node:path');
    const moduleApi = process.getBuiltinModule('node:module');
    if (!pathApi || !moduleApi) throw new Error('Node built-ins unavailable.');
    const loadModule = moduleApi.createRequire(pathApi.join(app.getAppPath(), 'main.js'));
    const backups = loadModule(pathApi.join(app.getAppPath(), 'database', 'backupSettings.js'));
    const settings = loadModule(pathApi.join(app.getAppPath(), 'database', 'settingsStore.js'));
    settings.saveJsonSetting('backup_settings', { ...backups.loadBackupSettings(), backup_dir: value,
      overridden_fields: ['backup_dir'] });
  }, foreignPath);
  const dialog = await openBackupsSection(desktopWindow);
  await expect(dialog.getByRole('button', { name: /^(Change location|更改位置)$/ })).toHaveAttribute('title', foreignPath);
  await dialog.getByRole('button', { name: /^(Create backup|创建备份)$/ }).click();
  await expect(dialog.getByText(/Choose a folder on this device or reset the location/u)).toBeVisible();
  await expect(dialog).not.toContainText('Error invoking remote method');
  await dialog.screenshot({ path: testInfo.outputPath('foreign-path-error.png') });

  await dialog.getByRole('button', { name: /^(Restore default|恢复默认值)$/ }).click();
  await expect.poll(() => desktopWindow.evaluate(async () =>
    (await window.electronAPI.invoke('load_backup_settings', {}) as { backup_dir: string }).backup_dir)).toBe('');
  await dialog.getByRole('button', { name: /^(Create backup|创建备份)$/ }).click();
  await expect(dialog.getByText(/Backup created:/u)).toBeVisible();
  await expect.poll(() => desktopWindow.evaluate(async () =>
    (await window.electronAPI.invoke('list_sqlite_backups', {}) as unknown[]).length)).toBeGreaterThan(0);
  const entries = await desktopWindow.evaluate(async () =>
    window.electronAPI.invoke('list_sqlite_backups', {})) as { filePath: string }[];
  const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  if (!libraryHome) throw new Error('Missing isolated Library home.');
  expect(entries.every((entry) => path.dirname(entry.filePath) === path.join(libraryHome, 'Backups'))).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath('local-backup-restored.png') });
});
