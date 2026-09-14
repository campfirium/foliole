import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { LocalizationProvider } from '../../../../shared/localization/LocalizationProvider';

import { BackupListSection } from './backupSettingsSectionParts';
import { backupEntry } from './SettingsBackupsSection.testUtils';

it('formats backup dates in the active Chinese interface language', async () => {
  render(
    <LocalizationProvider initialLanguagePreference="zh-Hans">
      <BackupListSection
        backups={[backupEntry('foliole-auto-backup.db.gz', '2026-09-14T07:56:00', {
          kind: 'automatic', sizeBytes: 101 * 1024 * 1024
        })]}
        createBackup={() => undefined}
        isBackupActionsAvailable
        isCreatingBackup={false}
        isLoadingBackups={false}
        restoringPath=""
        restoreBackup={() => undefined}
        statusMessage=""
      />
    </LocalizationProvider>
  );

  expect(await screen.findByText('自动备份 · 2026年9月14日 07:56 · 101 MB')).toBeInTheDocument();
  expect(screen.queryByText(/Sept/)).not.toBeInTheDocument();
});
