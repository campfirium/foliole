import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const changes = vi.hoisted(() => ({ listener: null as (() => void) | null, unsubscribe: vi.fn() }));
vi.mock('../../../../shared/platform/databaseBackupRuntimeRepository', () => ({
  loadDatabaseSpaceStatusFromRuntime: vi.fn(async () => null),
  subscribeDatabaseBackupsChanged: (listener: () => void) => {
    changes.listener = listener;
    return changes.unsubscribe;
  }
}));

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

it('refreshes external backup changes every time all backups are opened', async () => {
  const initial = [
    backupEntry('manual-2026-04-02_11-00-00-000.db', '2026-04-02T11:00:00.000Z'),
    backupEntry('manual-2026-04-02_10-00-00-000.db', '2026-04-02T10:00:00.000Z'),
    backupEntry('manual-2026-04-02_09-00-00-000.db', '2026-04-02T09:00:00.000Z'),
    ...defaultBackups
  ];
  const copied = backupEntry('manual-2026-04-02_12-00-00-000.db', '2026-04-02T12:00:00.000Z');
  vi.mocked(listDatabaseBackups).mockResolvedValueOnce(initial).mockResolvedValue([copied, ...initial]);
  renderWithLocalization(<SettingsBackupsSection />);

  fireEvent.click(await screen.findByRole('button', { name: 'View all backups' }));
  expect(await screen.findByText(copied.fileName)).toBeInTheDocument();
  expect(screen.getByText('auto-daily-2026-04-02_08-00-00-000.db')).toBeInTheDocument();
  expect(listDatabaseBackups).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
  expect(listDatabaseBackups).toHaveBeenCalledTimes(2);
  vi.mocked(listDatabaseBackups).mockResolvedValue(initial);
  fireEvent.click(screen.getByRole('button', { name: 'View all backups' }));
  await waitFor(() => expect(screen.queryByText(copied.fileName)).not.toBeInTheDocument());
  expect(screen.getByText('auto-daily-2026-04-02_08-00-00-000.db')).toBeInTheDocument();
  expect(listDatabaseBackups).toHaveBeenCalledTimes(3);
});

it('updates an open list and storage status when background cleanup removes a backup', async () => {
  const obsolete = backupEntry('foliole-manual-260930-120000.db.gz', '2026-09-30T12:00:00.000Z');
  vi.mocked(listDatabaseBackups).mockResolvedValueOnce([obsolete, ...defaultBackups]).mockResolvedValue(defaultBackups);
  const view = renderWithLocalization(<SettingsBackupsSection />);
  await screen.findByText(obsolete.fileName);
  const previousStatusReads = vi.mocked(loadBackupRetentionStatus).mock.calls.length;
  act(() => changes.listener?.());
  await waitFor(() => expect(screen.queryByText(obsolete.fileName)).not.toBeInTheDocument());
  expect(loadBackupRetentionStatus).toHaveBeenCalledTimes(previousStatusReads + 1);
  view.unmount();
  expect(changes.unsubscribe).toHaveBeenCalled();
});
