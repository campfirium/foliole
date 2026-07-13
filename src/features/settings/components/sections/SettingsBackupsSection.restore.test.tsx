import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/platform/folderSelectionRuntimeRepository', () => ({ selectRuntimeFolder: vi.fn() }));
vi.mock('../../../../store/workspaceRefreshScheduler', () => ({ refreshWorkspaceState: vi.fn() }));
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
  loadSourceDispositionSummary: vi.fn(),
  restoreDatabaseBackup: vi.fn()
}));

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { refreshWorkspaceState } from '../../../../store/workspaceRefreshScheduler';
import { listDatabaseBackups, loadSourceDispositionSummary, restoreDatabaseBackup } from '../../model/databaseBackups';
import { loadDatabaseBackupSettings } from '../../model/databaseBackupSettings';

import { SettingsBackupsSection } from './SettingsBackupsSection';
import { defaultBackups, defaultSettings } from './SettingsBackupsSection.testUtils';

beforeEach(() => {
  vi.mocked(loadDatabaseBackupSettings).mockResolvedValue(defaultSettings);
  vi.mocked(listDatabaseBackups).mockResolvedValue(defaultBackups);
  vi.mocked(loadSourceDispositionSummary).mockResolvedValue({ recordCount: 0, sizeBytes: 0 });
  vi.mocked(refreshWorkspaceState).mockReset().mockResolvedValue();
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

it('ends the restoring state and shows a completion dialog after workspace refresh', async () => {
  renderWithLocalization(<SettingsBackupsSection />);
  const restoreButton = await screen.findByRole('button', { name: 'Restore' });

  fireEvent.click(restoreButton);

  await waitFor(() => expect(restoreDatabaseBackup).toHaveBeenCalledWith(defaultBackups[0]?.filePath));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Backup restored');
  expect(screen.queryByText(/Reloading workspace/)).not.toBeInTheDocument();
  expect(restoreButton).toBeEnabled();
  expect(refreshWorkspaceState).toHaveBeenCalledWith('backup-restore');

  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
