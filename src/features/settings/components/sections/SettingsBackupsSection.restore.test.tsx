vi.mock('../../model/backupRestoreSyncChoice', () => ({ chooseBackupRestoreSync: vi.fn(async () => ({ source: 'current', action: 'local', revision: 'a'.repeat(64) })) }));
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
import { AppConfirmationProvider } from '../../../../shared/ui/AppConfirmationProvider';
import {
  beginWorkspaceRestoreSession,
  cancelWorkspaceRestoreSession,
  completeWorkspaceRestoreSession
} from '../../../../store/workspaceRestoreSession';
import { chooseBackupRestoreSync } from '../../model/backupRestoreSyncChoice';
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

  await waitFor(() => expect(restoreDatabaseBackup).toHaveBeenCalledWith(defaultBackups[0]?.filePath, expect.objectContaining({ source: 'current', action: 'local' })));
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

  await screen.findByText('The backup could not be restored. Keep your backup files and restart Foliole before making more changes.');
  expect(cancelWorkspaceRestoreSession).toHaveBeenCalledOnce();
  expect(completeWorkspaceRestoreSession).not.toHaveBeenCalled();
});

it.each([
  'The selected backup was not restored. Your current library is unchanged.',
  'The selected backup was not restored. Your current library has been restored.',
  'The selected backup was not restored, and Foliole could not reopen the current library. Keep your backup files and restart Foliole before making more changes.'
])('keeps the failure outcome visible after the backup section unmounts: %s', async (message) => {
  vi.mocked(restoreDatabaseBackup).mockResolvedValue({ ok: false, errorMessage: message });
  const view = renderWithLocalization(<AppConfirmationProvider><SettingsBackupsSection /></AppConfirmationProvider>);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]!);
  await screen.findByRole('dialog');
  view.rerender(<AppConfirmationProvider><div>Another section</div></AppConfirmationProvider>);
  expect(screen.getByRole('dialog')).toHaveTextContent(message);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('reports database success when rebuilding the renderer session fails and keeps writes frozen', async () => {
  vi.mocked(completeWorkspaceRestoreSession).mockImplementation(() => { throw new Error('session storage unavailable'); });
  renderWithLocalization(<AppConfirmationProvider><SettingsBackupsSection /></AppConfirmationProvider>);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Backup restored' });
  expect(dialog).toHaveTextContent('The backup was restored, but Foliole could not reload the library. Restart Foliole before making more changes.');
  expect(cancelWorkspaceRestoreSession).not.toHaveBeenCalled();
});

it('shows the inspection error and unchanged outcome before restore starts', async () => {
  vi.mocked(listDatabaseBackups).mockClear();
  vi.mocked(chooseBackupRestoreSync).mockRejectedValueOnce(new Error('file is not a database'));
  renderWithLocalization(<AppConfirmationProvider><SettingsBackupsSection /></AppConfirmationProvider>);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Backup not restored' });
  expect(dialog).toHaveTextContent('Your current library is unchanged.');
  expect(dialog).toHaveTextContent('The selected file is not a valid library backup.');
  expect(dialog).toHaveTextContent('file is not a database');
  expect(restoreDatabaseBackup).not.toHaveBeenCalled();
  expect(beginWorkspaceRestoreSession).not.toHaveBeenCalled();
  expect(listDatabaseBackups).toHaveBeenCalledTimes(2);
});

it('shows the restore reason together with the rollback outcome', async () => {
  vi.mocked(restoreDatabaseBackup).mockResolvedValue({ ok: false,
    errorMessage: 'The selected backup was not restored. Your current library has been restored.\nReason: delivery_authorization_ambiguous:Phone' });
  renderWithLocalization(<AppConfirmationProvider><SettingsBackupsSection /></AppConfirmationProvider>);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Restore' }))[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Backup not restored' });
  expect(dialog).toHaveTextContent('Your current library has been restored.');
  expect(dialog).toHaveTextContent('Sync authorization records could not be matched unambiguously to a device.');
  expect(dialog).toHaveTextContent('delivery_authorization_ambiguous:Phone');
});
