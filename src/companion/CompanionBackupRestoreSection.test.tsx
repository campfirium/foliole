import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { CompanionDatabaseBlockedError } from '../../lib/core/database/companionDatabaseLifecycle';

const fixture = vi.hoisted(() => ({
  stage: vi.fn(),
  discard: vi.fn(async () => undefined),
  port: {
    cancel: vi.fn(async () => undefined),
    addListener: vi.fn(async () => ({ remove: async () => undefined }))
  }
}));

vi.mock('../shared/platform/companion/backupRestore/companionBackupRestoreRuntimeRepository', () => ({
  supportsCompanionBackupRestore: () => true, getCompanionBackupRestorePort: () => fixture.port
}));
vi.mock('../shared/platform/companion/backupRestore/companionBackupRestore', () => ({
  stageCompanionBackupRestore: fixture.stage, discardCompanionBackupRestore: fixture.discard
}));
vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({}), runIosCompanionSideDatabase: vi.fn()
}));

import { CompanionBackupRestoreSection } from './CompanionBackupRestoreSection';

const summary = {
  backupHostName: 'Main Phone', backupVersion: 117, entryCount: 1840, lastModifiedAt: '2026-11-20T08:00:00Z',
  stagedAttachmentCount: 5210, missingAttachmentCount: 3, unreadableEntryCount: 0,
  sourceLabel: 'Foliole backup.zip', skippedFiles: 0, damagedFiles: 1
};

beforeEach(() => { vi.clearAllMocks(); });

it('reads a chosen zip and shows what the backup holds without replacing anything', async () => {
  fixture.stage.mockResolvedValueOnce({ cancelled: false, summary });
  render(<CompanionBackupRestoreSection />);
  fireEvent.click(screen.getByTestId('companion-restore-open'));
  fireEvent.click(await screen.findByTestId('companion-restore-zip'));

  const shown = await screen.findByTestId('companion-restore-summary');
  expect(fixture.stage.mock.calls[0]![1]).toBe('zip');
  expect(shown).toHaveTextContent('Foliole backup.zip');
  expect(shown).toHaveTextContent('Main Phone');
  expect(shown).toHaveTextContent('1840');
  expect(shown).toHaveTextContent('5210 included · 3 not in the backup · 1 damaged, skipped');
  expect(shown).toHaveTextContent('Nothing on this phone has been replaced yet.');

  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByTestId('companion-restore-summary')).not.toBeInTheDocument());
  expect(fixture.discard).toHaveBeenCalledOnce();
});

it('explains why a backup cannot be used and lets the user choose again', async () => {
  fixture.stage.mockRejectedValueOnce(new CompanionDatabaseBlockedError('newer-version'));
  fixture.stage.mockRejectedValueOnce(new Error('restore_sync_group_active'));
  render(<CompanionBackupRestoreSection />);
  fireEvent.click(screen.getByTestId('companion-restore-open'));
  fireEvent.click(await screen.findByTestId('companion-restore-folder'));
  expect(await screen.findByRole('alert')).toHaveTextContent('This backup is from a newer version of Foliole.');
  expect(fixture.stage.mock.calls[0]![1]).toBe('folder');

  fireEvent.click(screen.getByTestId('companion-restore-zip'));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Leave the sync group before restoring.'));
  expect(fixture.discard).not.toHaveBeenCalled();
});

it('cancels a backup that is still being read instead of closing over it', async () => {
  fixture.stage.mockReturnValueOnce(new Promise(() => undefined));
  render(<CompanionBackupRestoreSection />);
  fireEvent.click(screen.getByTestId('companion-restore-open'));
  fireEvent.click(await screen.findByTestId('companion-restore-zip'));
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  expect(fixture.port.cancel).toHaveBeenCalledOnce();
  expect(screen.getByRole('status')).toHaveTextContent('Reading backup…');
});
