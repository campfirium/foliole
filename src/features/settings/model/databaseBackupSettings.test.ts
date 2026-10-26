import { expect, it, vi } from 'vitest';

vi.mock('../../../shared/platform/settingsRuntimeRepository', () => ({
  hasSettingsRuntimeRepository: () => true,
  createDatabaseBackupInRuntime: vi.fn(),
  listDatabaseBackupsFromRuntime: vi.fn(),
  restoreDatabaseBackupInRuntime: vi.fn(),
  loadDatabaseBackupSettingsFromRuntime: vi.fn(),
  saveDatabaseBackupSettingsToRuntime: vi.fn()
}));

import { createDatabaseBackupInRuntime, saveDatabaseBackupSettingsToRuntime } from '../../../shared/platform/settingsRuntimeRepository';

import { createDatabaseBackup } from './databaseBackups';
import { loadDatabaseBackupSettings, saveDatabaseBackupSettings } from './databaseBackupSettings';

it('propagates a rejected backup location instead of returning an unsaved success', async () => {
  vi.mocked(saveDatabaseBackupSettingsToRuntime).mockRejectedValueOnce(new Error('Invalid backup location.'));
  const settings = await loadDatabaseBackupSettings();
  await expect(saveDatabaseBackupSettings({ ...settings, backup_dir: '/Volumes/Other' }))
    .rejects.toThrow('Invalid backup location.');
});


it('shows the backup directory failure without the internal IPC wrapper', async () => {
  vi.mocked(createDatabaseBackupInRuntime).mockRejectedValueOnce(new Error(
    "Error invoking remote method 'foliole:invoke': Error: Choose a folder on this device."
  ));
  await expect(createDatabaseBackup()).resolves.toEqual({ ok: false,
    errorMessage: 'Choose a folder on this device.' });
});
