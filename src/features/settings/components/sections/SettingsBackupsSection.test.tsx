import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/platform/folderSelectionRuntimeRepository', () => ({
  selectRuntimeFolder: vi.fn()
}));

vi.mock('../../model/databaseBackupSettings', () => ({
  loadDatabaseBackupSettings: vi.fn(),
  saveDatabaseBackupSettings: vi.fn()
}));

vi.mock('../../model/databaseBackups', () => ({
  areDatabaseBackupActionsAvailable: vi.fn(),
  createDatabaseBackup: vi.fn(),
  exportSourceDispositions: vi.fn(),
  importSourceDispositions: vi.fn(),
  listDatabaseBackups: vi.fn(),
  loadBackupRetentionStatus: vi.fn(),
  loadSourceDispositionSummary: vi.fn(),
  restoreDatabaseBackup: vi.fn()
}));

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { selectRuntimeFolder } from '../../../../shared/platform/folderSelectionRuntimeRepository';
import {
  areDatabaseBackupActionsAvailable,
  createDatabaseBackup,
  exportSourceDispositions,
  importSourceDispositions,
  listDatabaseBackups,
  loadBackupRetentionStatus,
  loadSourceDispositionSummary,
  restoreDatabaseBackup
} from '../../model/databaseBackups';
import {
  loadDatabaseBackupSettings,
  saveDatabaseBackupSettings
} from '../../model/databaseBackupSettings';

import { SettingsBackupsSection } from './SettingsBackupsSection';
import { backupEntry, defaultBackups, defaultRetentionStatus, defaultSettings } from './SettingsBackupsSection.testUtils';

beforeEach(() => {
  vi.mocked(selectRuntimeFolder).mockReset();
  vi.mocked(loadDatabaseBackupSettings).mockReset();
  vi.mocked(saveDatabaseBackupSettings).mockReset();
  vi.mocked(areDatabaseBackupActionsAvailable).mockReset();
  vi.mocked(createDatabaseBackup).mockReset();
  vi.mocked(exportSourceDispositions).mockReset();
  vi.mocked(importSourceDispositions).mockReset();
  vi.mocked(listDatabaseBackups).mockReset();
  vi.mocked(loadBackupRetentionStatus).mockReset();
  vi.mocked(loadSourceDispositionSummary).mockReset();
  vi.mocked(restoreDatabaseBackup).mockReset();
  vi.mocked(areDatabaseBackupActionsAvailable).mockReturnValue(true);
  vi.mocked(loadDatabaseBackupSettings).mockResolvedValue(defaultSettings);
  vi.mocked(saveDatabaseBackupSettings).mockResolvedValue(defaultSettings);
  vi.mocked(listDatabaseBackups).mockResolvedValue(defaultBackups);
  vi.mocked(loadBackupRetentionStatus).mockResolvedValue(defaultRetentionStatus);
  vi.mocked(exportSourceDispositions).mockResolvedValue({ ok: true, value: { entryCount: 2, path: '/out/handling.txt', status: 'saved' } });
  vi.mocked(importSourceDispositions).mockResolvedValue({ ok: true, value: { appliedDeletedCount: 1, appliedDismissedCount: 1, importedCount: 2, status: 'imported', summary: { recordCount: 2, sizeBytes: 1536 } } });
  vi.mocked(loadSourceDispositionSummary).mockResolvedValue({ recordCount: 2, sizeBytes: 1536 });
  vi.mocked(createDatabaseBackup).mockResolvedValue({
    ok: true,
    value: {
      destinationPath: '/app/Backups/manual-2026-04-02_09-00-00-000.db',
      extraBackup: { destinationPath: null, errorMessage: null, status: 'disabled' },
      remainingPages: 0,
      sidecarCleanup: { deletedCount: 0, failedCount: 0, releasedBytes: 0 },
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

it('shows backup settings and backup list in the backups section', async () => {
  renderWithLocalization(<SettingsBackupsSection />);

  await waitFor(() => {
    expect(screen.getByRole('spinbutton', { name: 'Hourly backups kept' })).toHaveValue(8);
  });

  const headings = screen.getAllByRole('heading');
  expect(headings.indexOf(screen.getByRole('heading', { name: 'Search backup content' })))
    .toBeLessThan(headings.indexOf(screen.getByRole('heading', { name: 'Backups' })));
  expect(screen.getByText('Unpack existing backups one at a time and search their contents.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Change location' })).toHaveTextContent('Backups');
  expect(screen.getByRole('button', { name: 'Change location' })).toHaveAttribute('title', '/app/Backups');
  expect(screen.getByRole('button', { name: 'Change location' }).closest('[data-settings-control-slot]')?.className).toContain('flex-[0_0_auto]');
  expect(screen.getByRole('button', { name: 'Change extra location' })).toHaveTextContent('Off');
  expect(screen.getByRole('heading', { name: 'Extra backup copy' })).toBeInTheDocument();
  expect(screen.getByText('Location')).toBeInTheDocument();
  expect(screen.getByText('Backup scope')).toBeInTheDocument();
  expect(screen.getByText(/They do not restore external original files/)).toBeInTheDocument();
  expect(screen.getAllByDisplayValue('10')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Create backup' }).className).not.toContain('min-w-[');
  expect(screen.getByText('Current')).toBeInTheDocument();
  expect(screen.getByText('Set')).toBeInTheDocument();
  expect(screen.getByText('Retention priority')).toBeInTheDocument();
  expect(screen.getByText('auto-daily-2026-04-02_08-00-00-000.db')).toBeInTheDocument();
  expect(screen.getByText(/Auto backup .* 6 MB/)).toBeInTheDocument();
  expect(screen.queryByText(/Auto backup .* daily/)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Source topic handling' })).toBeInTheDocument();
  expect(screen.getByText('Saved source topic handling')).toBeInTheDocument();
  expect(screen.getByText('2 entries / 2 KB')).toBeInTheDocument();
});

it('shows a retry action when backup settings fail to load', async () => {
  vi.mocked(loadDatabaseBackupSettings)
    .mockRejectedValueOnce(new Error('Settings IPC failed.'))
    .mockResolvedValueOnce(defaultSettings);

  renderWithLocalization(<SettingsBackupsSection />);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Backup settings unavailable');
  expect(alert).toHaveTextContent('Could not load backup settings.');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getByRole('spinbutton', { name: 'Hourly backups kept' })).toHaveValue(8);
  });
  expect(loadDatabaseBackupSettings).toHaveBeenCalledTimes(2);
});

it('auto-saves edited backup settings without a save button', async () => {
  renderWithLocalization(<SettingsBackupsSection />);

  const hourlyInput = await screen.findByRole('spinbutton', { name: 'Hourly backups kept' });
  fireEvent.change(hourlyInput, { target: { value: '12' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Total backup size limit (GB)' }), { target: { value: '3' } });

  await waitFor(() => {
    expect(saveDatabaseBackupSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        hourly_max_count: 12,
        total_size_limit_bytes: 3 * 1024 * 1024 * 1024
      })
    );
  });
  expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
});

it('auto-saves a keyboard priority reorder', async () => {
  renderWithLocalization(<SettingsBackupsSection />);

  const handle = await screen.findByRole('button', { name: 'Move Hourly backups kept' });
  fireEvent.keyDown(handle, { key: 'ArrowDown' });

  await waitFor(() => {
    expect(saveDatabaseBackupSettings).toHaveBeenCalledWith(expect.objectContaining({
      retention_priority: ['daily', 'weekly', 'hourly', 'monthly']
    }));
  });
});

it('changes backup location through folder picker and saves immediately', async () => {
  vi.mocked(selectRuntimeFolder).mockResolvedValue('/new/Backups');

  renderWithLocalization(<SettingsBackupsSection />);

  await screen.findByRole('spinbutton', { name: 'Hourly backups kept' });
  fireEvent.click(screen.getByRole('button', { name: 'Change location' }));

  await waitFor(() => {
    expect(saveDatabaseBackupSettings).toHaveBeenCalledWith(
      expect.objectContaining({ backup_dir: '/new/Backups' })
    );
  });
});

it('changes and turns off the extra backup location', async () => {
  vi.mocked(selectRuntimeFolder).mockResolvedValue('/cloud/Foliole Backups');

  renderWithLocalization(<SettingsBackupsSection />);

  await screen.findByRole('spinbutton', { name: 'Hourly backups kept' });
  fireEvent.click(screen.getByRole('button', { name: 'Change extra location' }));

  await waitFor(() => {
    expect(saveDatabaseBackupSettings).toHaveBeenCalledWith(
      expect.objectContaining({ extra_backup_dir: '/cloud/Foliole Backups' })
    );
  });

  fireEvent.click(screen.getByRole('button', { name: 'Turn off extra backup location' }));

  await waitFor(() => {
    expect(saveDatabaseBackupSettings).toHaveBeenCalledWith(
      expect.objectContaining({ extra_backup_dir: '' })
    );
  });
});

it('keeps backup disclosure inside the list without creating a separate backup group', async () => {
  vi.mocked(listDatabaseBackups).mockResolvedValue([
    backupEntry('manual-2026-04-02_11-00-00-000.db', '2026-04-02T11:00:00.000Z'),
    backupEntry('manual-2026-04-02_10-00-00-000.db', '2026-04-02T10:00:00.000Z'),
    backupEntry('manual-2026-04-02_09-00-00-000.db', '2026-04-02T09:00:00.000Z'),
    ...defaultBackups
  ]);

  renderWithLocalization(<SettingsBackupsSection />);

  await screen.findByRole('button', { name: 'View all backups' });
  expect(screen.queryByText('auto-daily-2026-04-02_08-00-00-000.db')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'More backups' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'View all backups' }));

  expect(screen.getByText('auto-daily-2026-04-02_08-00-00-000.db')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
});

it('creates a manual backup and refreshes the list', async () => {
  vi.mocked(listDatabaseBackups)
    .mockResolvedValueOnce(defaultBackups)
    .mockResolvedValueOnce([
      backupEntry('manual-2026-04-02_09-00-00-000.db', '2026-04-02T09:00:00.000Z')
    ]);

  renderWithLocalization(<SettingsBackupsSection />);

  await screen.findByRole('button', { name: 'Create backup' });
  fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));

  await waitFor(() => {
    expect(createDatabaseBackup).toHaveBeenCalledWith();
  });
  expect(screen.getByText('Backup created: manual-2026-04-02_09-00-00-000.db.')).toBeInTheDocument();
});

it('shows a warning when the extra backup copy fails after the main backup is created', async () => {
  vi.mocked(createDatabaseBackup).mockResolvedValue({
    ok: true,
    value: {
      destinationPath: '/app/Backups/manual-2026-04-02_09-00-00-000.db',
      extraBackup: {
        destinationPath: null,
        errorMessage: 'Cloud folder unavailable.',
        status: 'failed'
      },
      remainingPages: 0,
      sidecarCleanup: { deletedCount: 0, failedCount: 0, releasedBytes: 0 },
      sourcePath: '/app/Data/foliole.db',
      totalPages: 12
    }
  });

  renderWithLocalization(<SettingsBackupsSection />);

  await screen.findByRole('button', { name: 'Create backup' });
  fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));

  expect(await screen.findByText(/Extra copy failed: Cloud folder unavailable/)).toBeInTheDocument();
});
