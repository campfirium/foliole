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
  loadSourceDispositionSummary,
  restoreDatabaseBackup
} from '../../model/databaseBackups';
import {
  loadDatabaseBackupSettings,
  saveDatabaseBackupSettings
} from '../../model/databaseBackupSettings';

import { SettingsBackupsSection } from './SettingsBackupsSection';
import { backupEntry, defaultBackups, defaultSettings } from './SettingsBackupsSection.testUtils';

beforeEach(() => {
  vi.mocked(selectRuntimeFolder).mockReset();
  vi.mocked(loadDatabaseBackupSettings).mockReset();
  vi.mocked(saveDatabaseBackupSettings).mockReset();
  vi.mocked(areDatabaseBackupActionsAvailable).mockReset();
  vi.mocked(createDatabaseBackup).mockReset();
  vi.mocked(exportSourceDispositions).mockReset();
  vi.mocked(importSourceDispositions).mockReset();
  vi.mocked(listDatabaseBackups).mockReset();
  vi.mocked(loadSourceDispositionSummary).mockReset();
  vi.mocked(restoreDatabaseBackup).mockReset();

  vi.mocked(areDatabaseBackupActionsAvailable).mockReturnValue(true);
  vi.mocked(loadDatabaseBackupSettings).mockResolvedValue(defaultSettings);
  vi.mocked(saveDatabaseBackupSettings).mockResolvedValue(defaultSettings);
  vi.mocked(listDatabaseBackups).mockResolvedValue(defaultBackups);
  vi.mocked(exportSourceDispositions).mockResolvedValue({ ok: true, value: { entryCount: 2, path: '/out/handling.txt', status: 'saved' } });
  vi.mocked(importSourceDispositions).mockResolvedValue({ ok: true, value: { appliedDeletedCount: 1, appliedDismissedCount: 1, importedCount: 2, status: 'imported', summary: { recordCount: 2, sizeBytes: 1536 } } });
  vi.mocked(loadSourceDispositionSummary).mockResolvedValue({ recordCount: 2, sizeBytes: 1536 });
  vi.mocked(createDatabaseBackup).mockResolvedValue({
    ok: true,
    value: {
      destinationPath: '/app/Backups/manual-2026-04-02_09-00-00-000.db',
      extraBackup: { destinationPath: null, errorMessage: null, status: 'disabled' },
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

it('shows backup settings and backup list in the backups section', async () => {
  renderWithLocalization(<SettingsBackupsSection />);

  await waitFor(() => {
    expect(screen.getByDisplayValue('24')).toBeInTheDocument();
  });

  expect(screen.getByRole('button', { name: 'Change location' })).toHaveTextContent('Backups');
  expect(screen.getByRole('button', { name: 'Change location' })).toHaveAttribute('title', '/app/Backups');
  expect(screen.getByRole('button', { name: 'Change location' }).closest('[data-settings-control-slot]')?.className).toContain('flex-[0_0_auto]');
  expect(screen.getByRole('button', { name: 'Change extra location' })).toHaveTextContent('Off');
  expect(screen.getByRole('heading', { name: 'Extra backup copy' })).toBeInTheDocument();
  expect(screen.getByText('Location')).toBeInTheDocument();
  expect(screen.getByText('Backup scope')).toBeInTheDocument();
  expect(screen.getByText(/They do not restore external original files/)).toBeInTheDocument();
  expect(screen.getAllByDisplayValue('10')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Create backup' }).className).not.toContain('min-w-[');
  expect(screen.getByDisplayValue('24').parentElement?.className).toContain('flex-[0_0_160px]');
  expect(screen.getByText('auto-daily-2026-04-02_08-00-00-000.db')).toBeInTheDocument();
  expect(screen.getByText(/Auto backup .* daily/)).toBeInTheDocument();
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
    expect(screen.getByDisplayValue('24')).toBeInTheDocument();
  });
  expect(loadDatabaseBackupSettings).toHaveBeenCalledTimes(2);
});

it('auto-saves edited backup settings without a save button', async () => {
  renderWithLocalization(<SettingsBackupsSection />);

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

  renderWithLocalization(<SettingsBackupsSection />);

  await screen.findByDisplayValue('24');
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

  await screen.findByDisplayValue('24');
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

it('shows only three backups by default and expands the rest on demand', async () => {
  vi.mocked(listDatabaseBackups).mockResolvedValue([
    backupEntry('manual-2026-04-02_11-00-00-000.db', '2026-04-02T11:00:00.000Z'),
    backupEntry('manual-2026-04-02_10-00-00-000.db', '2026-04-02T10:00:00.000Z'),
    backupEntry('manual-2026-04-02_09-00-00-000.db', '2026-04-02T09:00:00.000Z'),
    ...defaultBackups
  ]);

  renderWithLocalization(<SettingsBackupsSection />);

  await screen.findByRole('button', { name: 'Show 1 more' });
  expect(screen.queryByText('auto-daily-2026-04-02_08-00-00-000.db')).not.toBeInTheDocument();
  expect(screen.getByText('More backups').compareDocumentPosition(screen.getByRole('heading', { name: 'Source topic handling' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

  fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }));

  expect(screen.getByText('auto-daily-2026-04-02_08-00-00-000.db')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
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
      sourcePath: '/app/Data/foliole.db',
      totalPages: 12
    }
  });

  renderWithLocalization(<SettingsBackupsSection />);

  await screen.findByRole('button', { name: 'Create backup' });
  fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));

  expect(await screen.findByText(/Extra copy failed: Cloud folder unavailable/)).toBeInTheDocument();
});
