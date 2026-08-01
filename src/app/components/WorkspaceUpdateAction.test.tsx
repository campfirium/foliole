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
  expect(button.className).toContain('workspace-update-action-nudge');
  expect(button.querySelector('.lucide-circle-arrow-down')).toBeInTheDocument();

  fireEvent.click(button);
  expect(updateMock.install).toHaveBeenCalledTimes(1);
});

it('replays the reminder after one minute while the update stays ready', () => {
  vi.useFakeTimers();
  updateMock.state = { phase: 'ready', version: '0.7.0' };
  renderWithLocalization(<WorkspaceUpdateAction />);

  expect(screen.getByRole('button', { name: 'Restart to install update' })).toHaveAttribute('data-nudge-sequence', '0');
  act(() => vi.advanceTimersByTime(60 * 1000));
  expect(screen.getByRole('button', { name: 'Restart to install update' })).toHaveAttribute('data-nudge-sequence', '1');
});
