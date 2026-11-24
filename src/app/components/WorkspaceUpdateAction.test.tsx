import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { NativeDesktopUpdateState } from '../../../lib/platform/nativeUpdateContract';
import { SettingsVersionBlock } from '../../features/settings/components/sections/SettingsVersionBlock';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { DEFAULT_UPDATE_STATE, type MobileChannels, type UpdateManifest } from '../../shared/platform/updateCheckModel';
import { registerAppConfirmationHandler } from '../../shared/ui/appConfirmation';

import { WorkspaceUpdateAction } from './WorkspaceUpdateAction';

const updateMock = vi.hoisted(() => ({
  choice: vi.fn(),
  install: vi.fn(),
  manifest: null as UpdateManifest | null,
  mobileChannels: {} as MobileChannels,
  manifestSubscribers: new Set<() => void>(),
  state: { phase: 'idle' } as NativeDesktopUpdateState,
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

vi.mock(import('../../shared/platform/updateCheck'), async (importOriginal) => ({
  ...await importOriginal(),
  readUpdateCheckState: () => ({
    ...DEFAULT_UPDATE_STATE,
    cachedManifest: updateMock.manifest,
    cachedMobileChannels: updateMock.mobileChannels
  }),
  refreshCachedUpdateManifest: async () => undefined,
  subscribeUpdateCheckState: (subscriber: () => void) => {
    updateMock.manifestSubscribers.add(subscriber);
    return () => { updateMock.manifestSubscribers.delete(subscriber); };
  }
}));

vi.mock('../../shared/ui/appChoice', () => ({ requestAppChoice: updateMock.choice }));

beforeEach(() => {
  window.localStorage.clear();
  updateMock.choice.mockReset();
  updateMock.manifest = null;
  updateMock.mobileChannels = { apk: { status: 'available', version: '0.8.3' } };
  updateMock.manifestSubscribers.clear();
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
  updateMock.state = { errorCode: 'install-failed', phase: 'ready', version: '0.7.0' };
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

function gatedManifest(): UpdateManifest {
  return {
    releases: [{
      platforms: ['macos'],
      syncBreaking: true,
      url: 'https://github.com/campfirium/foliole/releases/tag/v0.8.3',
      version: '0.8.3'
    }],
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

it('uses the same warning and wait state for both desktop install buttons', async () => {
  updateMock.manifest = gatedManifest();
  updateMock.state = { phase: 'ready', version: '0.8.3' };
  updateMock.choice.mockResolvedValueOnce(null).mockResolvedValueOnce('ios');
  renderWithLocalization(<><WorkspaceUpdateAction /><SettingsVersionBlock /></>);

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restart and install' })));
  expect(updateMock.choice).toHaveBeenCalledTimes(1);
  expect(updateMock.install).not.toHaveBeenCalled();

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restart to install update' })));
  expect(screen.queryByRole('button', { name: 'Restart to install update' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Restart and install' })).not.toBeInTheDocument();
  expect(updateMock.install).not.toHaveBeenCalled();
});

it('never installs a later candidate using the previous candidate’s confirmation', async () => {
  updateMock.manifest = gatedManifest();
  updateMock.state = { phase: 'ready', version: '0.8.3' };
  let confirm: (choice: string) => void = () => undefined;
  updateMock.choice.mockReturnValue(new Promise((resolve) => { confirm = resolve; }));
  renderWithLocalization(<WorkspaceUpdateAction />);

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restart to install update' })));
  expect(updateMock.choice).toHaveBeenCalledTimes(1);
  updateMock.state = { phase: 'ready', version: '0.8.4' };
  act(() => updateMock.subscriber?.());
  await act(async () => confirm('install'));

  expect(updateMock.install).not.toHaveBeenCalled();
});

it('shows one installation confirmation when the awaited mobile channel is ready', async () => {
  updateMock.manifest = gatedManifest();
  updateMock.state = { phase: 'ready', version: '0.8.3' };
  updateMock.choice.mockResolvedValue('ios');
  const confirm = vi.fn(async () => true);
  const unregister = registerAppConfirmationHandler(confirm);
  try {
    renderWithLocalization(<><WorkspaceUpdateAction /><SettingsVersionBlock /></>);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restart and install' })));
    expect(confirm).not.toHaveBeenCalled();

    await act(async () => {
      updateMock.mobileChannels.ios = { status: 'available', version: '0.8.3' };
      updateMock.manifestSubscribers.forEach(subscriber => subscriber());
    });

    expect(confirm).toHaveBeenCalledOnce();
    expect(updateMock.install).toHaveBeenCalledExactlyOnceWith('0.8.3');
  } finally {
    unregister();
  }
});
