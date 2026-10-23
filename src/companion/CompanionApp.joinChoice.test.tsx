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

function startChoice() {
  render(<CompanionApp />);
  let choice!: ReturnType<typeof chooseSyncGroupJoinMode>;
  act(() => { choice = chooseSyncGroupJoinMode(t); });
  return () => choice;
}

it('returns use-group without extra confirmation', async () => {
  const choice = startChoice();
  fireEvent.click(await screen.findByRole('button', { name: /overwrite this device/ }));
  await expect(choice()).resolves.toBe('use-group');
});

it('requires two explicit confirmations before overwriting the entire group', async () => {
  const choice = startChoice();
  fireEvent.click(await screen.findByRole('button', { name: /overwrite the entire group/ }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Overwrite the entire sync group with this device’s data?');
  fireEvent.click(screen.getByRole('button', { name: 'Yes, continue' }));
  expect(await screen.findByText(/old or empty copy/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Overwrite the entire group' }));
  await expect(choice()).resolves.toBe('overwrite');
});

it.each(['first', 'final'])('cancels the overwrite when the %s confirmation is declined', async (step) => {
  const choice = startChoice();
  fireEvent.click(await screen.findByRole('button', { name: /overwrite the entire group/ }));
  if (step === 'final') {
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, continue' }));
    await screen.findByText(/old or empty copy/);
  }
  fireEvent.click(await screen.findByRole('button', { name: 'No' }));
  await expect(choice()).resolves.toBeNull();
});
