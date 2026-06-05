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
  exportSourceDispositions: vi.fn(),
  importSourceDispositions: vi.fn(),
  listDatabaseBackups: vi.fn(),
  loadSourceDispositionSummary: vi.fn(),
  resetSourceDispositions: vi.fn(),
}));

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import {
  areDatabaseBackupActionsAvailable,
  exportSourceDispositions,
  importSourceDispositions,
  listDatabaseBackups,
  loadSourceDispositionSummary,
  resetSourceDispositions
} from '../../model/databaseBackups';
import { loadDatabaseBackupSettings } from '../../model/databaseBackupSettings';

import { SettingsBackupsSection } from './SettingsBackupsSection';

beforeEach(() => {
  vi.mocked(areDatabaseBackupActionsAvailable).mockReturnValue(true);
  vi.mocked(loadDatabaseBackupSettings).mockResolvedValue({
    auto_daily_days: 7,
    auto_hourly_hours: 24,
    auto_monthly_months: 0,
    auto_weekly_weeks: 4,
    backup_dir: '/app/Backups',
    extra_backup_dir: '',
    extra_backup_max_count: 10,
    manual_max_count: 10,
    snapshot_max_count: 5,
    total_size_limit_bytes: 2 * 1024 * 1024 * 1024,
    updated_at: '2026-04-02T10:00:00.000Z'
  });
  vi.mocked(listDatabaseBackups).mockResolvedValue([]);
  vi.mocked(loadSourceDispositionSummary).mockResolvedValue({ recordCount: 2, sizeBytes: 1536 });
  vi.mocked(exportSourceDispositions).mockResolvedValue({ ok: true, value: { entryCount: 2, path: '/out/handling.txt', status: 'saved' } });
  vi.mocked(importSourceDispositions).mockResolvedValue({ ok: true, value: { appliedDeletedCount: 1, appliedDismissedCount: 2, importedCount: 3, status: 'imported', summary: { recordCount: 3, sizeBytes: 2048 } } });
  vi.mocked(resetSourceDispositions).mockResolvedValue({ ok: true, value: { recordCount: 0, sizeBytes: 0 } });
});

it('imports, exports, and clears saved source topic handling from the backup row', async () => {
  renderWithLocalization(<SettingsBackupsSection />);

  await screen.findByRole('button', { name: 'Import saved source topic handling' });
  fireEvent.click(screen.getByRole('button', { name: 'Export saved source topic handling' }));

  await waitFor(() => {
    expect(exportSourceDispositions).toHaveBeenCalledWith();
  });
  expect(await screen.findByText('Exported 2 saved source topic entries.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Import saved source topic handling' }));

  await waitFor(() => {
    expect(importSourceDispositions).toHaveBeenCalledWith();
  });
  expect(await screen.findByText('Imported 3 saved source topic entries and applied 3.')).toBeInTheDocument();
  expect(screen.getByText('3 entries / 2 KB')).toBeInTheDocument();

  expect(screen.queryByRole('button', { name: 'Re-apply saved source topic handling' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clear saved source topic handling' }));

  await waitFor(() => {
    expect(resetSourceDispositions).toHaveBeenCalledWith();
  });
  expect(await screen.findByText('Cleared saved source topic handling.')).toBeInTheDocument();
  expect(screen.getByText('0 entries / 0 B')).toBeInTheDocument();
});
