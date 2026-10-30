import { app, dialog, type BrowserWindow } from 'electron';

import { BackupDirectoryPathError, isBackupDirectoryPath } from './database/backupDirectoryPaths.js';
import { normalizeBackupSettings, resolveManagedBackupDirectory, saveBackupSettings } from './database/backupSettings.js';
import { runWithDatabaseConnectionOwner } from './database/connection.js';
import { loadJsonSetting } from './database/settingsStore.js';

/** Keep migration stopped until the user explicitly corrects invalid local backup paths. */
export async function recoverStartupBackupDirectory(error: unknown, window: BrowserWindow) {
  if (!(error instanceof BackupDirectoryPathError) || window.isDestroyed()) return false;
  const settings = await runWithDatabaseConnectionOwner(() => normalizeBackupSettings(loadJsonSetting('backup_settings')));
  const invalidPrimary = !isBackupDirectoryPath(settings.backup_dir);
  const invalidExtra = !isBackupDirectoryPath(settings.extra_backup_dir);
  if (!invalidPrimary && !invalidExtra) return false;
  const defaultDirectory = await runWithDatabaseConnectionOwner(() =>
    resolveManagedBackupDirectory({ ...settings, backup_dir: '' }));
  const detail = [
    'A backup is required before this library can be upgraded.',
    ...(invalidPrimary ? [`Backup folder: ${settings.backup_dir}`, `Use local default: ${defaultDirectory}`] : []),
    ...(invalidExtra ? [`Extra-copy folder: ${settings.extra_backup_dir}`, 'The invalid extra-copy folder will be disabled.'] : []),
    'Foliole will restart after saving your choice.'
  ].join('\n\n');
  const { response } = await dialog.showMessageBox(window, {
    type: 'error', title: 'Backup folder needs attention', message: error.message, detail,
    buttons: ['Use local defaults', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true
  });
  if (response !== 0 || window.isDestroyed()) return false;
  await runWithDatabaseConnectionOwner(() => saveBackupSettings({
    ...(invalidPrimary ? { backup_dir: '' } : {}), ...(invalidExtra ? { extra_backup_dir: '' } : {})
  }));
  app.relaunch();
  app.quit();
  return true;
}
