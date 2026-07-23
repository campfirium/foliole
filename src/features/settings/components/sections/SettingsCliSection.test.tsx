import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const runAction = vi.hoisted(() => vi.fn());

vi.mock('../../../../shared/platform/folioleCliInstallation', () => ({
  runFolioleCliInstallationAction: runAction
}));

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsCliSection } from './SettingsCliSection';

const state = (status: string, error: string | null = null) => ({ commandPath: null, error, status });

beforeEach(() => {
  runAction.mockReset();
});

it('stays hidden when the packaged CLI is unavailable', async () => {
  runAction.mockResolvedValue(state('unavailable'));
  renderWithLocalization(<SettingsCliSection />);

  await waitFor(() => expect(runAction).toHaveBeenCalledWith('status'));
  expect(screen.queryByText('Foliole CLI')).not.toBeInTheDocument();
});

it('keeps the install action after cancellation and disables it on conflict', async () => {
  runAction
    .mockResolvedValueOnce(state('not_installed'))
    .mockResolvedValueOnce(state('cancelled'));
  const firstRender = renderWithLocalization(<SettingsCliSection />);

  fireEvent.click(await screen.findByRole('button', { name: 'Install command' }));
  expect(await screen.findByText('No changes were made.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Install command' })).toBeEnabled();

  firstRender.unmount();
  runAction.mockReset();
  runAction.mockResolvedValue(state('conflict', 'conflict'));
  renderWithLocalization(<SettingsCliSection />);
  expect(await screen.findByRole('button', { name: 'Install command' })).toBeDisabled();
});

it('removes an installed command and returns to the install state', async () => {
  runAction
    .mockResolvedValueOnce(state('installed'))
    .mockResolvedValueOnce(state('not_installed'));
  renderWithLocalization(<SettingsCliSection />);

  fireEvent.click(await screen.findByRole('button', { name: 'Remove command' }));
  await waitFor(() => expect(runAction).toHaveBeenLastCalledWith('remove'));
  expect(screen.getByRole('button', { name: 'Install command' })).toBeInTheDocument();
});

it('repairs a moved command and exposes a busy state while working', async () => {
  let finishRepair!: (value: ReturnType<typeof state>) => void;
  const pending = new Promise<ReturnType<typeof state>>((resolve) => { finishRepair = resolve; });
  runAction.mockResolvedValueOnce(state('repair_required')).mockReturnValueOnce(pending);
  renderWithLocalization(<SettingsCliSection />);

  fireEvent.click(await screen.findByRole('button', { name: 'Repair command' }));
  expect(screen.getByRole('button', { name: 'Repair command' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Repair command' })).toHaveAttribute('aria-busy', 'true');
  finishRepair(state('installed'));
  expect(await screen.findByRole('button', { name: 'Remove command' })).toBeEnabled();
  expect(runAction).toHaveBeenLastCalledWith('repair');
});
