import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncNowButton } from './CompanionSyncNowButton';

describe('CompanionSyncNowButton', () => {
  it('identifies a manual action joined to the active run', () => {
    renderWithLocalization(
      <CompanionSyncNowButton
        isSyncing
        manualSyncAction={{ mode: 'joined', runId: 'run-auto-1' }}
        onSync={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Joining current sync' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-sync-action-mode', 'joined');
    expect(button).toHaveAttribute('data-sync-run-id', 'run-auto-1');
  });

  it('does not restore a completed manual action into an idle button', () => {
    renderWithLocalization(
      <CompanionSyncNowButton
        isSyncing={false}
        terminalRunId="run-completed"
        terminalRunResult="completed"
        onSync={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Sync Now' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('data-sync-action-mode');
    expect(button).not.toHaveAttribute('data-sync-run-id');
    expect(button).toHaveAttribute('data-sync-terminal-run-id', 'run-completed');
    expect(button).toHaveAttribute('data-sync-terminal-result', 'completed');
  });

  it('keeps duplicate UI actions disabled while automatic sync is visible', () => {
    renderWithLocalization(<CompanionSyncNowButton isSyncing onSync={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Syncing' })).toBeDisabled();
  });

  it('identifies a manual action that owns a new run', () => {
    renderWithLocalization(
      <CompanionSyncNowButton
        isSyncing
        manualSyncAction={{ mode: 'owned', runId: 'run-manual-1' }}
        onSync={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Syncing' });
    expect(button).toHaveAttribute('data-sync-action-mode', 'owned');
    expect(button).toHaveAttribute('data-sync-run-id', 'run-manual-1');
  });
});
