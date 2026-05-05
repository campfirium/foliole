import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/platform/importBridge', () => ({
  selectRuntimeImportDirectory: vi.fn()
}));

vi.mock('../../model/databaseBackupSettings', () => ({
  loadDatabaseBackupSettings: vi.fn(),
  saveDatabaseBackupSettings: vi.fn()
}));

vi.mock('../../model/databaseBackups', () => ({
  areDatabaseBackupActionsAvailable: vi.fn(),
  createDatabaseBackup: vi.fn(),
  listDatabaseBackups: vi.fn(),
  reloadAfterDatabaseRestore: vi.fn(),
  restoreDatabaseBackup: vi.fn()
}));

import { selectRuntimeImportDirectory } from '../../../../shared/platform/importBridge';
import {
  areDatabaseBackupActionsAvailable,
  createDatabaseBackup,
  listDatabaseBackups,
  reloadAfterDatabaseRestore,
  restoreDatabaseBackup
} from '../../model/databaseBackups';
import {
  loadDatabaseBackupSettings,
  saveDatabaseBackupSettings
} from '../../model/databaseBackupSettings';

import { SettingsAboutSection } from './SettingsAboutSection';

const defaultSettings = {
  auto_daily_days: 7,
  auto_hourly_hours: 24,
  auto_monthly_months: 0,
  auto_weekly_weeks: 4,
  backup_dir: '/app/Backups',
  manual_max_count: 10,
  snapshot_max_count: 5,
  total_size_limit_bytes: 2 * 1024 * 1024 * 1024,
  updated_at: '2026-04-02T10:00:00.000Z'
};

const defaultBackups = [
  {
    autoFrequency: 'daily' as const,
    fileName: 'auto-daily-2026-04-02_08-00-00-000.db',
    filePath: '/app/Backups/auto-daily-2026-04-02_08-00-00-000.db',
    kind: 'automatic' as const,
    snapshotReason: null,
    sizeBytes: 6 * 1024 * 1024,
    updatedAt: '2026-04-02T08:00:00.000Z'
  }
];

beforeEach(() => {
  vi.mocked(selectRuntimeImportDirectory).mockReset();
  vi.mocked(loadDatabaseBackupSettings).mockReset();
  vi.mocked(saveDatabaseBackupSettings).mockReset();
  vi.mocked(areDatabaseBackupActionsAvailable).mockReset();
  vi.mocked(createDatabaseBackup).mockReset();
  vi.mocked(listDatabaseBackups).mockReset();
  vi.mocked(reloadAfterDatabaseRestore).mockReset();
  vi.mocked(restoreDatabaseBackup).mockReset();

  vi.mocked(areDatabaseBackupActionsAvailable).mockReturnValue(true);
  vi.mocked(loadDatabaseBackupSettings).mockResolvedValue(defaultSettings);
  vi.mocked(saveDatabaseBackupSettings).mockResolvedValue(defaultSettings);
  vi.mocked(listDatabaseBackups).mockResolvedValue(defaultBackups);
  vi.mocked(createDatabaseBackup).mockResolvedValue({
    ok: true,
    value: {
      destinationPath: '/app/Backups/manual-2026-04-02_09-00-00-000.db',
      remainingPages: 0,
      sourcePath: '/app/Data/foliole.db',
      totalPages: 12
    }
  });
  vi.mocked(restoreDatabaseBackup).mockResolvedValue({
    ok: true,
    value: {
      remainingPages: 0,
      sourcePath: '/app/Backups/auto-daily-2026-04-02_08-00-00-000.db',
      targetPath: '/app/Data/foliole.db',
      totalPages: 12
    }
  });
});

it('shows backup settings and backup list', async () => {
  render(<SettingsAboutSection />);

  await waitFor(() => {
    expect(screen.getByDisplayValue('24')).toBeInTheDocument();
  });

  expect(screen.getByText('/app/Backups')).toBeInTheDocument();
  expect(screen.getByText('auto-daily-2026-04-02_08-00-00-000.db')).toBeInTheDocument();
  expect(screen.getByText(/Auto backup · daily/)).toBeInTheDocument();
});

it('saves edited backup settings', async () => {
  render(<SettingsAboutSection />);

  await screen.findByDisplayValue('24');
  fireEvent.change(screen.getByDisplayValue('24'), { target: { value: '12' } });
  fireEvent.change(screen.getByDisplayValue('2'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

  await waitFor(() => {
    expect(saveDatabaseBackupSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        auto_hourly_hours: 12,
        total_size_limit_bytes: 3 * 1024 * 1024 * 1024
      })
    );
  });
  expect(screen.getByText('Backup settings saved.')).toBeInTheDocument();
});

it('changes backup location through folder picker', async () => {
  vi.mocked(selectRuntimeImportDirectory).mockResolvedValue('/new/Backups');

  render(<SettingsAboutSection />);

  await screen.findByDisplayValue('24');
  fireEvent.click(screen.getByRole('button', { name: 'Change location' }));

  await waitFor(() => {
    expect(screen.getByText('Backup location updated. Save settings to apply it.')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  await waitFor(() => {
    expect(saveDatabaseBackupSettings).toHaveBeenCalledWith(
      expect.objectContaining({ backup_dir: '/new/Backups' })
    );
  });
});

it('creates a manual backup and refreshes the list', async () => {
  vi.mocked(listDatabaseBackups)
    .mockResolvedValueOnce(defaultBackups)
    .mockResolvedValueOnce([
      {
        autoFrequency: null,
        fileName: 'manual-2026-04-02_09-00-00-000.db',
        filePath: '/app/Backups/manual-2026-04-02_09-00-00-000.db',
        kind: 'manual' as const,
        snapshotReason: null,
        sizeBytes: 5 * 1024 * 1024,
        updatedAt: '2026-04-02T09:00:00.000Z'
      }
    ]);

  render(<SettingsAboutSection />);

  await screen.findByRole('button', { name: 'Create backup' });
  fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));

  await waitFor(() => {
    expect(createDatabaseBackup).toHaveBeenCalledWith();
  });
  expect(screen.getByText('Backup created: manual-2026-04-02_09-00-00-000.db.')).toBeInTheDocument();
});

it('restores from a listed backup', async () => {
  render(<SettingsAboutSection />);

  const restoreButton = await screen.findByRole('button', { name: 'Restore' });
  fireEvent.click(restoreButton);

  await waitFor(() => {
    expect(restoreDatabaseBackup).toHaveBeenCalledWith('/app/Backups/auto-daily-2026-04-02_08-00-00-000.db');
  });
  await waitFor(() => {
    expect(reloadAfterDatabaseRestore).toHaveBeenCalledWith();
  });
});
