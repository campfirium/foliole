import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { EN_BACKUP_RESTORE_SYNC_TRANSLATIONS } from '../shared/localization/locales/enBackupRestoreSync';
import type { Translate } from '../shared/localization/LocalizationProvider';
import { chooseSyncGroupJoinMode } from '../shared/ui/chooseSyncGroupJoinMode';
import { requestSyncGroupJoinWithChoice } from '../shared/ui/requestSyncGroupJoinWithChoice';

import { CompanionApp } from './CompanionApp';

vi.mock('./useCompanionBootstrap', () => ({ useCompanionBootstrap: () => ({ status: 'booting' }) }));
vi.mock('./CompanionShell', () => ({ CompanionShell: () => null }));

const t = ((key: keyof typeof EN_BACKUP_RESTORE_SYNC_TRANSLATIONS) =>
  EN_BACKUP_RESTORE_SYNC_TRANSLATIONS[key]) as Translate;

afterEach(cleanup);

it('hosts the real join mode choice and allows cancellation without a selection', async () => {
  render(<CompanionApp />);
  let choice!: ReturnType<typeof chooseSyncGroupJoinMode>;
  act(() => { choice = chooseSyncGroupJoinMode(t); });
  expect(await screen.findByRole('dialog')).toHaveTextContent('Join sync group');
  expect(screen.getByRole('button', { name: 'Merge data' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /overwrite the entire group/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await expect(choice).resolves.toBeNull();
});

it('hosts restoration protection and waits for explicit overwrite before retrying', async () => {
  render(<CompanionApp />);
  const request = vi.fn().mockRejectedValueOnce(new Error('sync_group_merge_requires_overwrite'))
    .mockResolvedValueOnce('pending');
  let result!: Promise<string | null>;
  await act(async () => { result = requestSyncGroupJoinWithChoice(t, 'merge', request); });
  expect(await screen.findByRole('dialog')).toHaveTextContent('Cannot merge data');
  expect(request.mock.calls).toEqual([['merge']]);
  fireEvent.click(screen.getByRole('button', { name: /overwrite the entire group/ }));
  await expect(result).resolves.toBe('pending');
  expect(request.mock.calls).toEqual([['merge'], ['overwrite']]);
});
