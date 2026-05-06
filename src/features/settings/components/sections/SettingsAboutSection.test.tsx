import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/platform/folderSelectionRuntimeRepository', () => ({
  selectRuntimeFolder: vi.fn()
}));

vi.mock('../../../../shared/platform/diagnosticBundle', () => ({
  exportDiagnosticBundle: vi.fn()
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

import { exportDiagnosticBundle } from '../../../../shared/platform/diagnosticBundle';
import { selectRuntimeFolder } from '../../../../shared/platform/folderSelectionRuntimeRepository';
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
import { SettingsBackupsSection } from './SettingsBackupsSection';

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
  vi.mocked(selectRuntimeFolder).mockReset();
  vi.mocked(exportDiagnosticBundle).mockReset();
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

it('shows application info and diagnostic export in the about section', async () => {
  vi.mocked(exportDiagnosticBundle).mockResolvedValue({
    filePath: '/Desktop/foliole-diagnostics.zip',
    includedFileCount: 3,
    status: 'exported'
  });
  render(<SettingsAboutSection />);

  expect(screen.getByText('Foliole desktop')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Export diagnostic bundle' }));
  await waitFor(() => {
    expect(exportDiagnosticBundle).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Diagnostic bundle exported with 3 files.')).toBeInTheDocument();
  });
  expect(screen.queryByText('/app/Backups')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create backup' })).not.toBeInTheDocument();
});

it('shows backup settings and backup list in the backups section', async () => {
  render(<SettingsBackupsSection />);

  await waitFor(() => {
    expect(screen.getByDisplayValue('24')).toBeInTheDocument();
  });

  expect(screen.getByRole('button', { name: 'Change location' })).toHaveTextContent('Backups');
  expect(screen.getByRole('button', { name: 'Change location' })).toHaveAttribute('title', '/app/Backups');
  expect(screen.getByRole('button', { name: 'Change location' }).closest('[data-settings-control-slot]')?.className).toContain('flex-[0_0_auto]');
  expect(screen.getByRole('button', { name: 'Change location' }).className).not.toContain('min-w-[');
  expect(screen.getByRole('button', { name: 'Create backup' }).className).not.toContain('min-w-[');
  expect(screen.getByDisplayValue('24').parentElement?.className).toContain('flex-[0_0_160px]');
  expect(screen.getByText('auto-daily-2026-04-02_08-00-00-000.db')).toBeInTheDocument();
  expect(screen.getByText(/Auto backup · daily/)).toBeInTheDocument();
});

it('shows a retry action when backup settings fail to load', async () => {
  vi.mocked(loadDatabaseBackupSettings)
    .mockRejectedValueOnce(new Error('Settings IPC failed.'))
    .mockResolvedValueOnce(defaultSettings);

  render(<SettingsBackupsSection />);

  expect(await screen.findByText('Could not load backup settings.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getByDisplayValue('24')).toBeInTheDocument();
  });
  expect(loadDatabaseBackupSettings).toHaveBeenCalledTimes(2);
});

it('auto-saves edited backup settings without a save button', async () => {
  render(<SettingsBackupsSection />);

  await screen.findByDisplayValue('24');
  fireEvent.change(screen.getByDisplayValue('24'), { target: { value: '12' } });
  fireEvent.change(screen.getByDisplayValue('2'), { target: { value: '3' } });

  await waitFor(() => {
    expect(saveDatabaseBackupSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        auto_hourly_hours: 12,
        total_size_limit_bytes: 3 * 1024 * 1024 * 1024
      })
    );
  });
  expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
});

it('changes backup location through folder picker and saves immediately', async () => {
  vi.mocked(selectRuntimeFolder).mockResolvedValue('/new/Backups');

  render(<SettingsBackupsSection />);

  await screen.findByDisplayValue('24');
  fireEvent.click(screen.getByRole('button', { name: 'Change location' }));

  await waitFor(() => {
    expect(saveDatabaseBackupSettings).toHaveBeenCalledWith(
      expect.objectContaining({ backup_dir: '/new/Backups' })
    );
  });
});

it('shows only three backups by default and expands the rest on demand', async () => {
  vi.mocked(listDatabaseBackups).mockResolvedValue([
    {
      autoFrequency: null,
      fileName: 'manual-2026-04-02_11-00-00-000.db',
      filePath: '/app/Backups/manual-2026-04-02_11-00-00-000.db',
      kind: 'manual' as const,
      snapshotReason: null,
      sizeBytes: 5 * 1024 * 1024,
      updatedAt: '2026-04-02T11:00:00.000Z'
    },
    {
      autoFrequency: null,
      fileName: 'manual-2026-04-02_10-00-00-000.db',
      filePath: '/app/Backups/manual-2026-04-02_10-00-00-000.db',
      kind: 'manual' as const,
      snapshotReason: null,
      sizeBytes: 5 * 1024 * 1024,
      updatedAt: '2026-04-02T10:00:00.000Z'
    },
    {
      autoFrequency: null,
      fileName: 'manual-2026-04-02_09-00-00-000.db',
      filePath: '/app/Backups/manual-2026-04-02_09-00-00-000.db',
      kind: 'manual' as const,
      snapshotReason: null,
      sizeBytes: 5 * 1024 * 1024,
      updatedAt: '2026-04-02T09:00:00.000Z'
    },
    ...defaultBackups
  ]);

  render(<SettingsBackupsSection />);

  await screen.findByRole('button', { name: 'Show 1 more' });
  expect(screen.queryByText('auto-daily-2026-04-02_08-00-00-000.db')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }));

  expect(screen.getByText('auto-daily-2026-04-02_08-00-00-000.db')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
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

  render(<SettingsBackupsSection />);

  await screen.findByRole('button', { name: 'Create backup' });
  fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));

  await waitFor(() => {
    expect(createDatabaseBackup).toHaveBeenCalledWith();
  });
  expect(screen.getByText('Backup created: manual-2026-04-02_09-00-00-000.db.')).toBeInTheDocument();
});

it('restores from a listed backup', async () => {
  render(<SettingsBackupsSection />);

  const restoreButton = await screen.findByRole('button', { name: 'Restore' });
  fireEvent.click(restoreButton);

  await waitFor(() => {
    expect(restoreDatabaseBackup).toHaveBeenCalledWith('/app/Backups/auto-daily-2026-04-02_08-00-00-000.db');
  });
  await waitFor(() => {
    expect(reloadAfterDatabaseRestore).toHaveBeenCalledWith();
  });
});
