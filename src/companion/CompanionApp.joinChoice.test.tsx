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
  act(() => { choice = chooseSyncGroupJoinMode(t, 'Home Library'); });
  expect(await screen.findByRole('dialog')).toHaveTextContent('Join sync group');
  expect(screen.queryByRole('button', { name: 'Merge data' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /overwrite this device/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /overwrite the entire group/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await expect(choice).resolves.toBeNull();
});

function startChoice() {
  render(<CompanionApp />);
  let choice!: ReturnType<typeof chooseSyncGroupJoinMode>;
  act(() => { choice = chooseSyncGroupJoinMode(t, 'Home Library'); });
  return () => choice;
}

it('returns use-group without extra confirmation', async () => {
  const choice = startChoice();
  fireEvent.click(await screen.findByRole('button', { name: /overwrite this device/ }));
  await expect(choice()).resolves.toBe('use-group');
});

async function openOtherOptions() {
  fireEvent.click(await screen.findByRole('button', { name: 'Other options' }));
  return screen.getByRole('button', { name: /overwrite the entire group/ });
}

it('folds the group overwrite behind other options as a red link', async () => {
  startChoice();
  const useGroup = await screen.findByRole('button', { name: /overwrite this device/ });
  const overwrite = await openOtherOptions();
  expect(useGroup.className).not.toContain('text-error');
  expect(overwrite.className).toContain('text-error');
});

async function passFirstConfirmation() {
  fireEvent.click(await openOtherOptions());
  expect(await screen.findByRole('dialog')).toHaveTextContent('Overwrite the entire sync group with this device’s data?');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  return screen.findByRole('textbox', { name: 'Sync group name' });
}

it('overwrites the entire group only after typing the exact group name', async () => {
  const choice = startChoice();
  const input = await passFirstConfirmation();
  expect(screen.getByRole('dialog')).toHaveTextContent('old or empty copy');
  const confirm = screen.getByRole('button', { name: 'Overwrite the entire group' });
  expect(confirm).toBeDisabled();
  fireEvent.change(input, { target: { value: 'Home' } });
  fireEvent.submit(input.closest('form')!);
  expect(confirm).toBeDisabled();
  fireEvent.change(input, { target: { value: 'Home Library' } });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await expect(choice()).resolves.toBe('overwrite');
});

it.each(['first', 'final'])('cancels the overwrite when the %s confirmation is declined', async (step) => {
  const choice = startChoice();
  if (step === 'final') await passFirstConfirmation();
  else fireEvent.click(await openOtherOptions());
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  await expect(choice()).resolves.toBeNull();
});
