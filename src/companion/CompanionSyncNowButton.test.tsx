import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncNowButton } from './CompanionSyncNowButton';

describe('CompanionSyncNowButton', () => {
  it('publishes the clicked action identity while it is starting', () => {
    renderWithLocalization(
      <CompanionSyncNowButton
        isSyncing={false}
        manualSyncAction={{ runId: 'run-manual-1', started: true,
          status: 'starting', terminalResult: null }}
        onSync={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Syncing' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-sync-action-run-id', 'run-manual-1');
    expect(button).toHaveAttribute('data-sync-action-started', 'true');
    expect(button).toHaveAttribute('data-sync-action-status', 'starting');
  });

  it('keeps the action-local terminal visible without leaving the button busy', () => {
    renderWithLocalization(
      <CompanionSyncNowButton
        isSyncing={false}
        manualSyncAction={{ runId: 'run-completed', started: true,
          status: 'terminal', terminalResult: 'completed' }}
        onSync={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Sync Now' });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('data-sync-action-run-id', 'run-completed');
    expect(button).toHaveAttribute('data-sync-action-started', 'true');
    expect(button).toHaveAttribute('data-sync-action-status', 'terminal');
    expect(button).toHaveAttribute('data-sync-action-terminal-run-id', 'run-completed');
    expect(button).toHaveAttribute('data-sync-action-terminal-result', 'completed');
  });

  it('keeps duplicate UI actions disabled while automatic sync is visible', () => {
    renderWithLocalization(<CompanionSyncNowButton isSyncing onSync={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Syncing' })).toBeDisabled();
  });
});

describe('CompanionSyncNowButton manual lifecycle', () => {
  it('keeps the same manual action identity while running', () => {
    renderWithLocalization(
      <CompanionSyncNowButton
        isSyncing
        manualSyncAction={{ runId: 'run-manual-1', started: true,
          status: 'running', terminalResult: null }}
        onSync={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Syncing' });
    expect(button).toHaveAttribute('data-sync-action-run-id', 'run-manual-1');
    expect(button).toHaveAttribute('data-sync-action-status', 'running');
  });

  it('keeps a failed result visible and accessible while allowing retry', () => {
    const onSync = vi.fn();
    const { rerender } = renderWithLocalization(
      <CompanionSyncNowButton
        failureDetail="Foliole could not connect to another device."
        isSyncing={false}
        manualSyncAction={{ runId: 'run-failed', started: true,
          status: 'terminal', terminalResult: 'failed' }}
        onSync={onSync}
      />
    );

    const failure = screen.getByRole('alert');
    expect(failure).toHaveTextContent('Sync failed.');
    expect(failure).toHaveTextContent('Foliole could not connect to another device.');
    expect(failure).toHaveTextContent('Unsynced changes remain on this device.');
    const retry = screen.getByRole('button', { name: 'Sync Now' });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(onSync).toHaveBeenCalledOnce();

    rerender(
      <CompanionSyncNowButton
        isSyncing={false}
        manualSyncAction={{ runId: 'run-retry', started: true,
          status: 'starting', terminalResult: null }}
        onSync={onSync}
      />
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
