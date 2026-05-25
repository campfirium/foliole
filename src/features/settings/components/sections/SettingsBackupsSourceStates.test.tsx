import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  listDatabaseBackups: vi.fn(),
  loadSourceDispositionSummary: vi.fn(),
  resetSourceDispositions: vi.fn(),
  restoreSourceDispositions: vi.fn()
}));

import {
  areDatabaseBackupActionsAvailable,
  listDatabaseBackups,
  loadSourceDispositionSummary,
  resetSourceDispositions,
  restoreSourceDispositions
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
  vi.mocked(resetSourceDispositions).mockResolvedValue({ ok: true, value: { recordCount: 0, sizeBytes: 0 } });
  vi.mocked(restoreSourceDispositions).mockResolvedValue({ ok: true, value: { dismissedCount: 1, trashedCount: 1 } });
});

it('restores and resets saved source states from the backup row', async () => {
  render(<SettingsBackupsSection />);

  await screen.findByRole('button', { name: 'Restore source states' });
  expect(screen.getByRole('button', { name: 'Reset source states' }).compareDocumentPosition(screen.getByRole('button', { name: 'Restore source states' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  fireEvent.click(screen.getByRole('button', { name: 'Restore source states' }));

  await waitFor(() => {
    expect(restoreSourceDispositions).toHaveBeenCalledWith();
  });
  expect(await screen.findByText('Restored 1 dismissed and 1 deleted source states.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Reset source states' }));

  await waitFor(() => {
    expect(resetSourceDispositions).toHaveBeenCalledWith();
  });
  expect(await screen.findByText('Source states reset.')).toBeInTheDocument();
  expect(screen.getByText('0 records / 0 B')).toBeInTheDocument();
});
