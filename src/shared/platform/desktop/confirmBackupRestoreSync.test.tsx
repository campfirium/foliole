import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useTranslation } from '../../localization/LocalizationProvider';
import { renderWithLocalization } from '../../localization/testLocalization';
import { AppConfirmationProvider } from '../../ui/AppConfirmationProvider';

import { resumeSyncWithBackupRestoreConfirmation } from './confirmBackupRestoreSync';

const runtime = vi.hoisted(() => ({ overview: vi.fn(), resume: vi.fn(), begin: vi.fn(), cancel: vi.fn() }));
vi.mock('../desktopSyncGroupRuntimeRepository', () => ({ loadDesktopSyncGroupOverview: runtime.overview }));
vi.mock('./companionSyncParticipationRuntime', () => ({ resumeDesktopCompanionSync: runtime.resume }));
vi.mock('../../../store/workspaceRestoreSession', () => ({
  beginWorkspaceRestoreSession: runtime.begin, cancelWorkspaceRestoreSession: runtime.cancel
}));
let resume!: () => ReturnType<typeof resumeSyncWithBackupRestoreConfirmation>;
function Consumer() {
  const t = useTranslation();
  resume = () => resumeSyncWithBackupRestoreConfirmation(t);
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
  runtime.overview.mockResolvedValue({ pending_backup_restore: 'restore-pending', sync_paused: true });
  runtime.begin.mockResolvedValue(true);
  runtime.resume.mockResolvedValue({ sync_paused: false, pending_backup_restore: null });
  renderWithLocalization(<AppConfirmationProvider><Consumer /></AppConfirmationProvider>);
});

it('keeps sync paused and the notice when the user cancels', async () => {
  let result!: ReturnType<typeof resume>;
  await act(async () => { result = resume(); });
  const dialog = await screen.findByRole('dialog', { name: 'Resume sync' });
  expect(dialog).toHaveTextContent('current library on this device');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await expect(result).resolves.toMatchObject({ sync_paused: true, pending_backup_restore: 'restore-pending' });
  expect(runtime.resume).not.toHaveBeenCalled();
  expect(runtime.begin).not.toHaveBeenCalled();
});

it('flushes current edits before handing off the confirmed overwrite', async () => {
  let result!: ReturnType<typeof resume>;
  await act(async () => { result = resume(); });
  fireEvent.click(await screen.findByRole('button', { name: 'Resume Sync' }));
  await expect(result).resolves.toMatchObject({ sync_paused: false });
  expect(runtime.resume).toHaveBeenCalledWith('restore-pending');
  expect(runtime.begin.mock.invocationCallOrder[0]).toBeLessThan(runtime.resume.mock.invocationCallOrder[0]!);
  expect(runtime.cancel).toHaveBeenCalledOnce();
});

it('retains ordinary resume when no overwrite is pending', async () => {
  runtime.overview.mockResolvedValue({ pending_backup_restore: null });
  await resume();
  expect(runtime.resume).toHaveBeenCalledWith();
  expect(screen.queryByRole('dialog')).toBeNull();
});
