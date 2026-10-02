import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { BackupRestoreSyncPreview } from '../../../../lib/platform/backupRestoreSyncContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { AppConfirmationProvider } from '../../../shared/ui/AppConfirmationProvider';

import { chooseBackupRestoreSync } from './backupRestoreSyncChoice';

const preview = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../../shared/platform/databaseBackupRuntimeRepository', () => ({
  inspectBackupRestoreSyncInRuntime: preview.load
}));
afterEach(() => vi.clearAllMocks());
let choose!: () => ReturnType<typeof chooseBackupRestoreSync>;
function Consumer() {
  const t = useTranslation();
  choose = () => chooseBackupRestoreSync('/backup', t);
  return null;
}
function render(same: boolean, backupGroup: boolean, currentGroup: boolean) {
  preview.load.mockResolvedValue({ same, revision: 'a'.repeat(64),
    backup: { group: backupGroup ? { id: 'backup', name: 'Group' } : null, enabled: true, paused: false },
    current: { group: currentGroup ? { id: 'current', name: 'Group' } : null, enabled: true, paused: false }
  } satisfies BackupRestoreSyncPreview);
  renderWithLocalization(<AppConfirmationProvider><Consumer /></AppConfirmationProvider>);
}

for (const source of ['backup', 'current'] as const) {
  for (const action of ['overwrite', 'pause'] as const) {
    it(`allows ${source} settings followed by ${action}`, async () => {
      render(false, true, true);
      let result!: ReturnType<typeof choose>;
      await act(async () => { result = choose(); });
      fireEvent.click(await screen.findByRole('button', { name: source === 'backup'
        ? 'Use the backup’s sync group settings' : 'Keep current sync settings' }));
      fireEvent.click(await screen.findByRole('button', { name: action === 'overwrite'
        ? 'Sync now and overwrite the entire group' : 'Pause sync and restore only this device first' }));
      await expect(result).resolves.toEqual({ source, action, revision: 'a'.repeat(64) });
    });
  }
}

it('skips redundant source selection and allows cancellation without restoring', async () => {
  render(true, true, true);
  let result!: ReturnType<typeof choose>;
  await act(async () => { result = choose(); });
  expect(await screen.findByRole('dialog', { name: 'Sync after restoring' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Keep current sync settings' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await expect(result).resolves.toBeNull();
});

it('returns local-only for a chosen ungrouped configuration', async () => {
  render(false, true, false);
  let result!: ReturnType<typeof choose>;
  await act(async () => { result = choose(); });
  fireEvent.click(await screen.findByRole('button', { name: 'Keep current sync settings' }));
  await expect(result).resolves.toMatchObject({ source: 'current', action: 'local' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('does not show either choice when both configurations are identical and ungrouped', async () => {
  render(true, false, false);
  await expect(choose()).resolves.toMatchObject({ source: 'current', action: 'local' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
