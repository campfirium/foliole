import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceUpdateAction } from './WorkspaceUpdateAction';

const updateMock = vi.hoisted(() => ({
  install: vi.fn(),
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

beforeEach(() => {
  updateMock.install.mockReset();
  updateMock.state = { phase: 'idle' };
  updateMock.subscriber = null;
});

afterEach(() => vi.useRealTimers());

it('stays hidden until an update is ready', () => {
  renderWithLocalization(<WorkspaceUpdateAction />);

  expect(screen.queryByRole('button', { name: 'Restart and update' })).not.toBeInTheDocument();
});

it('shows a compact neutral CircleArrowDown action and installs the ready update', () => {
  renderWithLocalization(<WorkspaceUpdateAction />);

  updateMock.state = { phase: 'ready', version: '0.7.0' };
  act(() => updateMock.subscriber?.());

  const button = screen.getByRole('button', { name: 'Restart to install update' });
  expect(button.className).toContain('workspace-update-action');
  expect(button.className).not.toContain('workspace-update-action-nudge');
  expect(button.querySelector('.lucide-circle-arrow-down')).toHaveClass('workspace-update-action-nudge');

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
  const firstIcon = button.querySelector('.lucide-circle-arrow-down');
  expect(button).toHaveAttribute('data-nudge-sequence', '0');
  act(() => vi.advanceTimersByTime(60 * 1000));
  expect(button).toHaveAttribute('data-nudge-sequence', '1');
  expect(button.querySelector('.lucide-circle-arrow-down')).not.toBe(firstIcon);
});
