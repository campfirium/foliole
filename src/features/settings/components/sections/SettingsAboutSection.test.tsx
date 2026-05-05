import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
    ok: true,
    value: {
      sourcePath: '/app/foliole.db',
      destinationPath: '/app/backups/foliole-2026-03-14_10-00-00-000.db',
      totalPages: 3,
      remainingPages: 0
    }
  });
  mockedListDatabaseBackups.mockResolvedValue({
    ok: true,
    value: [
      {
        fileName: 'foliole-2026-03-14_10-00-00-000.db',
        filePath: '/app/backups/foliole-2026-03-14_10-00-00-000.db',
        sizeBytes: 4096,
        updatedAt: '2026-03-14T10:00:00.000Z'
      }
    ]
  });
  mockedRestoreDatabaseBackup.mockResolvedValue({
    ok: true,
    value: {
      sourcePath: '/app/backups/foliole-2026-03-14_10-00-00-000.db',
      targetPath: '/app/foliole.db',
      totalPages: 3,
      remainingPages: 0
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
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
  mockedListDatabaseBackups.mockResolvedValueOnce({ ok: true, value: [] }).mockResolvedValueOnce({
    ok: true,
    value: [
      {
        fileName: 'foliole-2026-03-15_08-00-00-000.db',
        filePath: '/app/backups/foliole-2026-03-15_08-00-00-000.db',
        sizeBytes: 81920,
        updatedAt: '2026-03-15T08:00:00.000Z'
      }
    ]
  });
  mockedCreateDatabaseBackup.mockResolvedValue({
    ok: true,
    value: {
      sourcePath: '/app/foliole.db',
      destinationPath: '/app/backups/foliole-2026-03-15_08-00-00-000.db',
      totalPages: 20,
      remainingPages: 0
    }
  });

  render(<SettingsAboutSection />);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Create backup' })).toBeEnabled();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));

  await waitFor(() => {
    expect(mockedCreateDatabaseBackup).toHaveBeenCalledWith();
  });
  expect(mockedListDatabaseBackups).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Backup created: foliole-2026-03-15_08-00-00-000.db.')).toBeInTheDocument();
  expect(screen.getByText('foliole-2026-03-15_08-00-00-000.db')).toBeInTheDocument();
});

it('shows the native backup error message when creation fails', async () => {
  mockedCreateDatabaseBackup.mockResolvedValue({
    ok: false,
    errorMessage: 'EPERM: operation not permitted, mkdir C:\\\\Users\\\\zephu\\\\AppData\\\\Roaming\\\\foliole\\\\backups'
  });

  render(<SettingsAboutSection />);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Create backup' })).toBeEnabled();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));

  await waitFor(() => {
    expect(screen.getByText(/Backup creation failed: EPERM: operation not permitted/)).toBeInTheDocument();
  });
});

it('keeps a created backup visible when the list refresh fails', async () => {
  mockedListDatabaseBackups
    .mockResolvedValueOnce({ ok: true, value: [] })
    .mockResolvedValueOnce({ ok: false, errorMessage: 'backup directory scan timed out' });
  mockedCreateDatabaseBackup.mockResolvedValue({
    ok: true,
    value: {
      sourcePath: '/app/foliole.db',
      destinationPath: '/app/backups/foliole-2026-03-15_08-30-00-000.db',
      totalPages: 20,
      remainingPages: 0
    }
  });

  render(<SettingsAboutSection />);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Create backup' })).toBeEnabled();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));

  await waitFor(() => {
    expect(screen.getByText(/Backup list refresh failed: backup directory scan timed out/)).toBeInTheDocument();
  });
  expect(screen.getByText('foliole-2026-03-15_08-30-00-000.db')).toBeInTheDocument();
  expect(screen.getByText(/Pending refresh/)).toBeInTheDocument();
});

it('restores a backup from the listed entry', async () => {
  render(<SettingsAboutSection />);
  const restoreButton = await screen.findByRole('button', { name: 'Restore' });

  fireEvent.click(restoreButton);

  await waitFor(() => {
    expect(mockedRestoreDatabaseBackup).toHaveBeenCalledWith(
      '/app/backups/foliole-2026-03-14_10-00-00-000.db'
    );
  });
  await waitFor(() => {
    expect(screen.getByText('Backup restored from foliole-2026-03-14_10-00-00-000.db. Reloading workspace…')).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(mockedReloadAfterDatabaseRestore).toHaveBeenCalledWith();
  });
});

it('shows desktop-only fallback when runtime bridge is unavailable', async () => {
  mockedAreDatabaseBackupActionsAvailable.mockReturnValue(false);
  mockedListDatabaseBackups.mockResolvedValue(null);

  render(<SettingsAboutSection />);

  await waitFor(() => {
    expect(screen.getByText('Desktop runtime required')).toBeInTheDocument();
  });

  expect(screen.getByRole('button', { name: 'Create backup' })).toBeDisabled();
});

it('shows the backup list load error instead of silently acting empty', async () => {
  mockedListDatabaseBackups.mockResolvedValue({
    ok: false,
    errorMessage: 'native list command rejected'
  });

  render(<SettingsAboutSection />);

  await waitFor(() => {
    expect(screen.getByText('Backup list failed: native list command rejected')).toBeInTheDocument();
  });
  expect(screen.getByText('No backups yet')).toBeInTheDocument();
});
