import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/platform/folderSelectionRuntimeRepository', () => ({ selectRuntimeFolder: vi.fn() }));
vi.mock('../../../../store/workspaceRestoreSession', () => ({
  beginWorkspaceRestoreSession: vi.fn(),
  cancelWorkspaceRestoreSession: vi.fn(),
  completeWorkspaceRestoreSession: vi.fn()
}));
vi.mock('../../model/databaseBackupSettings', () => ({
  loadDatabaseBackupSettings: vi.fn(),
  saveDatabaseBackupSettings: vi.fn()
}));
vi.mock('../../model/databaseBackups', () => ({
  areDatabaseBackupActionsAvailable: vi.fn(() => true),
  createDatabaseBackup: vi.fn(),
  exportSourceDispositions: vi.fn(),
  importSourceDispositions: vi.fn(),
  listDatabaseBackups: vi.fn(),
  loadBackupRetentionStatus: vi.fn(),
  loadSourceDispositionSummary: vi.fn(),
  restoreDatabaseBackup: vi.fn()
}));

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import {
  beginWorkspaceRestoreSession,
  cancelWorkspaceRestoreSession,
  completeWorkspaceRestoreSession
} from '../../../../store/workspaceRestoreSession';
import { listDatabaseBackups, loadBackupRetentionStatus, loadSourceDispositionSummary, restoreDatabaseBackup } from '../../model/databaseBackups';
import { loadDatabaseBackupSettings } from '../../model/databaseBackupSettings';

import { SettingsBackupsSection } from './SettingsBackupsSection';
import { defaultBackups, defaultRetentionStatus, defaultSettings } from './SettingsBackupsSection.testUtils';

beforeEach(() => {
  vi.mocked(loadDatabaseBackupSettings).mockResolvedValue(defaultSettings);
  vi.mocked(listDatabaseBackups).mockResolvedValue(defaultBackups);
  vi.mocked(loadBackupRetentionStatus).mockResolvedValue(defaultRetentionStatus);
  vi.mocked(loadSourceDispositionSummary).mockResolvedValue({ recordCount: 0, sizeBytes: 0 });
  vi.mocked(beginWorkspaceRestoreSession).mockReset().mockResolvedValue(true);
  vi.mocked(cancelWorkspaceRestoreSession).mockReset();
  vi.mocked(completeWorkspaceRestoreSession).mockReset();
  vi.mocked(restoreDatabaseBackup).mockReset().mockResolvedValue({
    ok: true,
    value: {
      remainingPages: 0,
      sourcePath: '/app/Backups/auto-daily-2026-04-02_08-00-00-000.db',
      targetPath: '/app/Data/foliole.db',
      totalPages: 12
    }
  });
});

it('rebuilds the renderer session after a successful restore', async () => {
  const initialBackup = defaultBackups[0];
  if (!initialBackup) throw new Error('backup fixture is required');
  const safetySnapshot = {
    ...initialBackup,
    fileName: 'pre-restore-2026-08-12_08-00-00-000.db.gz',
    filePath: '/app/Backups/pre-restore-2026-08-12_08-00-00-000.db.gz',
    kind: 'snapshot' as const,
    snapshotReason: 'pre-restore' as const
  };
  vi.mocked(listDatabaseBackups)
    .mockResolvedValueOnce(defaultBackups)
    .mockResolvedValueOnce([safetySnapshot, ...defaultBackups]);
  renderWithLocalization(<SettingsBackupsSection />);
  const restoreButton = await screen.findByRole('button', { name: 'Restore' });

  fireEvent.click(restoreButton);

  await waitFor(() => expect(restoreDatabaseBackup).toHaveBeenCalledWith(defaultBackups[0]?.filePath));
  await waitFor(() => expect(completeWorkspaceRestoreSession).toHaveBeenCalledWith(initialBackup.fileName));
  expect(cancelWorkspaceRestoreSession).not.toHaveBeenCalled();
  expect(listDatabaseBackups).toHaveBeenCalledTimes(1);
});

it('does not touch the database when pending workspace changes cannot be saved', async () => {
  vi.mocked(beginWorkspaceRestoreSession).mockResolvedValue(false);
  renderWithLocalization(<SettingsBackupsSection />);

  fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]!);

  await screen.findByText('Backup restore did not start because recent changes could not be saved.');
  expect(restoreDatabaseBackup).not.toHaveBeenCalled();
});

it('unfreezes the current renderer session when restore fails', async () => {
  vi.mocked(restoreDatabaseBackup).mockResolvedValue({ ok: false, errorMessage: 'Restore failed.' });
  renderWithLocalization(<SettingsBackupsSection />);

  fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]!);

  await screen.findByText('Backup restore failed: Restore failed.');
  expect(cancelWorkspaceRestoreSession).toHaveBeenCalledOnce();
  expect(completeWorkspaceRestoreSession).not.toHaveBeenCalled();
});
