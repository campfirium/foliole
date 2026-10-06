import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { EN_BACKUP_RESTORE_SYNC_TRANSLATIONS } from '../shared/localization/locales/enBackupRestoreSync';
import type { Translate } from '../shared/localization/LocalizationProvider';
import { chooseSyncGroupJoinMode } from '../shared/ui/chooseSyncGroupJoinMode';

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
  expect(screen.queryByRole('button', { name: 'Merge data' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /overwrite this device/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /overwrite the entire group/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await expect(choice).resolves.toBeNull();
});

it.each([
  ['use-group', /overwrite this device/],
  ['overwrite', /overwrite the entire group/]
])('returns the explicit %s direction', async (mode, label) => {
  render(<CompanionApp />);
  let choice!: ReturnType<typeof chooseSyncGroupJoinMode>;
  act(() => { choice = chooseSyncGroupJoinMode(t); });
  fireEvent.click(await screen.findByRole('button', { name: label }));
  await expect(choice).resolves.toBe(mode);
});
