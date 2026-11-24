import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceUpdateAction } from './WorkspaceUpdateAction';

const updateMock = vi.hoisted(() => ({
  choice: vi.fn(),
  install: vi.fn(),
  manifest: null as unknown,
  state: { phase: 'idle' } as { phase: string; version?: string },
  subscriber: null as (() => void) | null
}));

vi.mock('../../shared/platform/desktopUpdate', () => ({
  installDesktopUpdate: updateMock.install,
  readDesktopUpdateState: () => updateMock.state,
  subscribeDesktopUpdateState: (subscriber: () => void) => {
    updateMock.subscriber = subscriber;
    return () => {
      updateMock.subscriber = null;
    };
  }
}));

vi.mock('../../shared/platform/updateCheck', () => ({
  readUpdateCheckState: () => ({ cachedManifest: updateMock.manifest }),
  refreshCachedUpdateManifest: async () => undefined,
  subscribeUpdateCheckState: () => () => undefined
}));

vi.mock('../../shared/ui/appChoice', () => ({ requestAppChoice: updateMock.choice }));

beforeEach(() => {
  window.localStorage.clear();
  updateMock.choice.mockReset();
  updateMock.manifest = null;
  updateMock.install.mockReset();
  updateMock.state = { phase: 'idle' };
  updateMock.subscriber = null;
});

afterEach(() => vi.useRealTimers());

it('stays hidden until an update is ready', () => {
  renderWithLocalization(<WorkspaceUpdateAction />);

  expect(screen.queryByRole('button', { name: 'Restart and update' })).not.toBeInTheDocument();
});

it('shows the current CircleArrowDown with the established button nudge', () => {
  renderWithLocalization(<WorkspaceUpdateAction />);

  updateMock.state = { phase: 'ready', version: '0.7.0' };
  act(() => updateMock.subscriber?.());

  const button = screen.getByRole('button', { name: 'Restart to install update' });
  expect(button.className).toContain('workspace-update-action');
  expect(button.className).toContain('workspace-update-action-nudge');
  expect(button.querySelector('.lucide-circle-arrow-down')).toBeInTheDocument();

  fireEvent.click(button);
  expect(updateMock.install).toHaveBeenCalledTimes(1);
});

it('shows immediate persistent disabled feedback while Foliole restarts', async () => {
  updateMock.state = { phase: 'restarting', version: '0.7.0' };
  renderWithLocalization(<WorkspaceUpdateAction />);

  const button = screen.getByRole('button', { name: 'Restarting… This may take a moment.' });
  expect(button).toBeDisabled();
  expect(button.querySelector('.lucide-loader-circle')).toHaveClass('animate-spin');
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Restarting… This may take a moment.');
});

it('makes a failed restart retryable instead of looking unresponsive', () => {
  updateMock.state = { errorCode: 'install-failed', phase: 'ready', version: '0.7.0' } as never;
  renderWithLocalization(<WorkspaceUpdateAction />);

  expect(screen.getByRole('button', { name: 'Restart failed. Try again' })).toBeEnabled();
});

it('replays the reminder after one minute while the update stays ready', () => {
  vi.useFakeTimers();
  updateMock.state = { phase: 'ready', version: '0.7.0' };
  renderWithLocalization(<WorkspaceUpdateAction />);

  const button = screen.getByRole('button', { name: 'Restart to install update' });
  const firstButton = button;
  expect(button).toHaveAttribute('data-nudge-sequence', '0');
  act(() => vi.advanceTimersByTime(60 * 1000));
  const replayedButton = screen.getByRole('button', { name: 'Restart to install update' });
  expect(replayedButton).toHaveAttribute('data-nudge-sequence', '1');
  expect(replayedButton).not.toBe(firstButton);
});

function gatedManifest() {
  return {
    releases: [{ mobileAvailability: { apk: true }, syncBreaking: true, version: '0.8.3' }],
    schemaVersion: 1
  };
}

it('dims the button and asks before installing while mobile channels are missing', async () => {
  updateMock.manifest = gatedManifest();
  updateMock.choice.mockResolvedValue(null);
  renderWithLocalization(<WorkspaceUpdateAction />);
  updateMock.state = { phase: 'ready', version: '0.8.3' };
  act(() => updateMock.subscriber?.());

  const button = screen.getByRole('button', { name: 'Restart to install update' });
  expect(button.className).toContain('workspace-update-action-dim');
  await act(async () => fireEvent.click(button));

  expect(updateMock.choice).toHaveBeenCalledTimes(1);
  expect(updateMock.choice.mock.calls[0]![0].choices.map((choice: { value: string }) => choice.value))
    .toEqual(['ios', 'googlePlay', 'all', 'install']);
  expect(updateMock.install).not.toHaveBeenCalled();
});

it('installs right away when the dialog chooses to install anyway', async () => {
  updateMock.manifest = gatedManifest();
  updateMock.choice.mockResolvedValue('install');
  renderWithLocalization(<WorkspaceUpdateAction />);
  updateMock.state = { phase: 'ready', version: '0.8.3' };
  act(() => updateMock.subscriber?.());

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restart to install update' })));

  expect(updateMock.install).toHaveBeenCalledTimes(1);
});

it('hides the button after choosing to wait', async () => {
  updateMock.manifest = gatedManifest();
  updateMock.choice.mockResolvedValue('ios');
  renderWithLocalization(<WorkspaceUpdateAction />);
  updateMock.state = { phase: 'ready', version: '0.8.3' };
  act(() => updateMock.subscriber?.());

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restart to install update' })));

  expect(screen.queryByRole('button', { name: 'Restart to install update' })).not.toBeInTheDocument();
});
