import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../model/databaseBackups', () => ({
  areDatabaseBackupActionsAvailable: vi.fn(),
  createDatabaseBackup: vi.fn(),
  listDatabaseBackups: vi.fn(),
  reloadAfterDatabaseRestore: vi.fn(),
  restoreDatabaseBackup: vi.fn()
}));

import {
  areDatabaseBackupActionsAvailable,
  createDatabaseBackup,
  listDatabaseBackups,
  reloadAfterDatabaseRestore,
  restoreDatabaseBackup
} from '../../model/databaseBackups';

import { SettingsAboutSection } from './SettingsAboutSection';

const mockedAreDatabaseBackupActionsAvailable = vi.mocked(areDatabaseBackupActionsAvailable);
const mockedCreateDatabaseBackup = vi.mocked(createDatabaseBackup);
const mockedListDatabaseBackups = vi.mocked(listDatabaseBackups);
const mockedReloadAfterDatabaseRestore = vi.mocked(reloadAfterDatabaseRestore);
const mockedRestoreDatabaseBackup = vi.mocked(restoreDatabaseBackup);

beforeEach(() => {
  mockedAreDatabaseBackupActionsAvailable.mockReset();
  mockedCreateDatabaseBackup.mockReset();
  mockedListDatabaseBackups.mockReset();
  mockedReloadAfterDatabaseRestore.mockReset();
  mockedRestoreDatabaseBackup.mockReset();
  mockedAreDatabaseBackupActionsAvailable.mockReturnValue(true);
  mockedCreateDatabaseBackup.mockResolvedValue({
    sourcePath: '/app/foliole.db',
    destinationPath: '/app/backups/foliole-2026-03-14_10-00-00-000.db',
    totalPages: 3,
    remainingPages: 0
  });
  mockedListDatabaseBackups.mockResolvedValue([
    {
      fileName: 'foliole-2026-03-14_10-00-00-000.db',
      filePath: '/app/backups/foliole-2026-03-14_10-00-00-000.db',
      sizeBytes: 4096,
      updatedAt: '2026-03-14T10:00:00.000Z'
    }
  ]);
  mockedRestoreDatabaseBackup.mockResolvedValue({
    sourcePath: '/app/backups/foliole-2026-03-14_10-00-00-000.db',
    targetPath: '/app/foliole.db',
    totalPages: 3,
    remainingPages: 0
  });
});

it('shows backup list entries loaded for the about settings section', async () => {
  render(<SettingsAboutSection />);

  await waitFor(() => {
    expect(screen.getByText('foliole-2026-03-14_10-00-00-000.db')).toBeInTheDocument();
  });

  expect(screen.getByRole('button', { name: 'Create backup' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled();
});

it('creates a backup and refreshes the visible list', async () => {
  render(<SettingsAboutSection />);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Create backup' })).toBeEnabled();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));

  await waitFor(() => {
    expect(mockedCreateDatabaseBackup).toHaveBeenCalledWith();
  });
  expect(mockedListDatabaseBackups).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Backup created.')).toBeInTheDocument();
});

it('restores a backup from the listed entry', async () => {
  render(<SettingsAboutSection />);

  fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

  await waitFor(() => {
    expect(mockedRestoreDatabaseBackup).toHaveBeenCalledWith(
      '/app/backups/foliole-2026-03-14_10-00-00-000.db'
    );
  });
  expect(mockedReloadAfterDatabaseRestore).toHaveBeenCalledWith();
});

it('shows desktop-only fallback when runtime bridge is unavailable', async () => {
  mockedAreDatabaseBackupActionsAvailable.mockReturnValue(false);
  mockedListDatabaseBackups.mockResolvedValue([]);

  render(<SettingsAboutSection />);

  await waitFor(() => {
    expect(screen.getByText('Desktop runtime required')).toBeInTheDocument();
  });

  expect(screen.getByRole('button', { name: 'Create backup' })).toBeDisabled();
});
