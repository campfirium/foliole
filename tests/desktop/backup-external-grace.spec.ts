import { copyFile, mkdir, readFile, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openBackupsSection } from './harness/settings';

test('keeps externally copied old backups available and trashes them only after their deadline', async ({
  desktopSession, desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);
  const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  if (!libraryHome) throw new Error('Missing isolated library home.');
  const directory = path.join(libraryHome, 'external-grace-backups');
  await mkdir(directory, { recursive: true });
  await desktopWindow.evaluate(async (backupDirectory) => {
    await window.electronAPI.invoke('save_backup_settings', { settings: {
      backup_dir: backupDirectory, extra_backup_dir: '', hourly_max_count: 1,
      daily_max_count: 0, weekly_max_count: 0, monthly_max_count: 0, total_size_limit_bytes: 1
    } });
  }, directory);
  const createBackup = () => desktopWindow.evaluate(async () =>
    window.electronAPI.invoke('backup_sqlite_database', {})) as Promise<{ destinationPath: string }>;
  const generated = await createBackup();
  const externalName = 'foliole-auto-250101-100000.db.gz';
  const externalPath = path.join(directory, externalName);
  await copyFile(generated.destinationPath, externalPath);
  const oldTime = new Date('2025-01-01T10:00:00Z');
  await utimes(externalPath, oldTime, oldTime);
  await createBackup();

  const recordPath = path.join(directory, '.foliole-backup-management.json');
  const record = JSON.parse(await readFile(recordPath, 'utf8')) as {
    whitelist: string[]; temporary: Record<string, number>;
  };
  expect(record.whitelist).not.toContain(externalName);
  expect(record.temporary[externalName]).toBeGreaterThan(Date.now());
  const dialog = await openBackupsSection(desktopWindow);
  await expect(dialog.getByRole('heading', { name: externalName })).toBeVisible();

  // Advance only this fixture's deadline instead of waiting a real day.
  record.temporary[externalName] = Date.now() - 1;
  await writeFile(recordPath, JSON.stringify(record));
  await createBackup();
  const entries = await desktopWindow.evaluate(async () =>
    window.electronAPI.invoke('list_sqlite_backups', {})) as { fileName: string }[];
  expect(entries.map((entry) => entry.fileName)).not.toContain(externalName);
  const settled = JSON.parse(await readFile(recordPath, 'utf8')) as typeof record;
  expect(settled.temporary).toEqual({});
  expect(settled.whitelist).not.toContain(externalName);
});
