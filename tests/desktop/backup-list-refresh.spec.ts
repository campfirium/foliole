import { copyFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openBackupsSection } from './harness/settings';

const SHOW_ALL = /^(View all backups|查看全部备份)$/;
const COLLAPSE = /^(Collapse|收起)$/;

// Use the native backup pipeline and external file copies in the isolated library.
test('viewing all backups refreshes files copied or removed outside the app', async ({ desktopSession, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  if (!libraryHome) throw new Error('Missing isolated Library home.');
  const backupDir = path.join(libraryHome, 'refresh-backups');
  await mkdir(backupDir, { recursive: true });
  await desktopWindow.evaluate(async (backupDirectory) => {
    await window.electronAPI.invoke('save_backup_settings', { settings: { backup_dir: backupDirectory } });
  }, backupDir);
  const backup = await desktopWindow.evaluate(async () =>
    window.electronAPI.invoke('backup_sqlite_database', {})) as { destinationPath: string };
  for (const suffix of ['120000', '110000', '100000']) {
    await copyFile(backup.destinationPath, path.join(backupDir, `foliole-manual-260930-${suffix}.db.gz`));
  }
  const dialog = await openBackupsSection(desktopWindow);
  await expect(dialog.getByRole('button', { name: SHOW_ALL })).toBeVisible();

  const copiedName = 'foliole-manual-261001-130000.db.gz';
  const copiedPath = path.join(backupDir, copiedName);
  await copyFile(backup.destinationPath, copiedPath);
  await expect(dialog.getByRole('heading', { name: copiedName })).toHaveCount(0);
  await dialog.getByRole('button', { name: SHOW_ALL }).click();
  await expect(dialog.getByRole('heading', { name: copiedName })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'foliole-manual-260930-100000.db.gz' })).toBeVisible();

  await dialog.getByRole('button', { name: COLLAPSE }).click();
  await unlink(copiedPath);
  await dialog.getByRole('button', { name: SHOW_ALL }).click();
  await expect(dialog.getByRole('heading', { name: copiedName })).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: 'foliole-manual-260930-100000.db.gz' })).toBeVisible();
});

test('an open backup list refreshes after native cleanup removes its old files', async ({ desktopSession, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  if (!libraryHome) throw new Error('Missing isolated Library home.');
  await desktopWindow.evaluate(async (backupDirectory) => {
    await window.electronAPI.invoke('save_backup_settings', { settings: {
      backup_dir: backupDirectory, hourly_max_count: 0, daily_max_count: 0,
      weekly_max_count: 0, monthly_max_count: 0, total_size_limit_bytes: 1
    } });
  }, path.join(libraryHome, 'cleanup-refresh'));
  const first = await desktopWindow.evaluate(async () =>
    window.electronAPI.invoke('backup_sqlite_database', {})) as { destinationPath: string };
  const dialog = await openBackupsSection(desktopWindow);
  await expect(dialog.getByRole('heading', { name: path.basename(first.destinationPath) })).toBeVisible();
  const next = await desktopWindow.evaluate(async () =>
    window.electronAPI.invoke('backup_sqlite_database', {})) as { destinationPath: string };
  await expect(dialog.getByRole('heading', { name: path.basename(first.destinationPath) })).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: path.basename(next.destinationPath) })).toBeVisible();
  const entries = await desktopWindow.evaluate(async () =>
    window.electronAPI.invoke('list_sqlite_backups', {})) as { filePath: string }[];
  expect(entries.map((entry) => entry.filePath)).not.toContain(first.destinationPath);
  await dialog.screenshot({ path: testInfo.outputPath('cleanup-refreshed-list.png') });
});
