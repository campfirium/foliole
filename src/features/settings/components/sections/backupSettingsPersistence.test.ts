import { expect, it, vi } from 'vitest';

vi.mock('../../model/databaseBackupSettings', () => ({ saveDatabaseBackupSettings: vi.fn() }));

import { saveDatabaseBackupSettings } from '../../model/databaseBackupSettings';

import { persistBackupSettings } from './backupSettingsSectionStateUtils';
import { defaultSettings } from './SettingsBackupsSection.testUtils';

it('reports a rejected local backup location without claiming it was saved', async () => {
  vi.mocked(saveDatabaseBackupSettings).mockRejectedValueOnce(new Error("Error invoking remote method 'save_backup_settings': Error: Choose a folder on this device."));
  const args = { nextSettings: { ...defaultSettings, backup_dir: '/Volumes/Other' },
    refreshBackupsList: vi.fn(), saveRequestIdRef: { current: 0 }, setDraft: vi.fn(),
    setIsSavingSettings: vi.fn(), setSettings: vi.fn(), setStatusMessage: vi.fn() };
  await persistBackupSettings(args);
  expect(args.setSettings).not.toHaveBeenCalled();
  expect(args.setStatusMessage).toHaveBeenLastCalledWith('Choose a folder on this device.');
  expect(args.setIsSavingSettings).toHaveBeenLastCalledWith(false);
});
