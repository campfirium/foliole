import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

const runtime = vi.hoisted(() => ({ providerAvailable: true }));
vi.mock('./companionSyncGroupProviderAvailability', () => ({
  useCompanionSyncGroupProviderAvailability: () => runtime.providerAvailable
}));

import { CompanionSyncNowButton } from './CompanionSyncNowButton';

afterEach(() => { runtime.providerAvailable = true; });

describe('CompanionSyncNowButton', () => {
  it('waits for the foreground provider lifecycle before enabling public sync', () => {
    runtime.providerAvailable = false;
    renderWithLocalization(<CompanionSyncNowButton isSyncing={false} onSync={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Sync Now' })).toBeDisabled();
  });

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
        runtimeBootedAt="2026-08-23T00:00:00.000Z"
        syncEvents={[{
          endpoint_url: 'http://desktop:38641', id: 'event-completed', kind: 'run_finished',
          message: 'All stages completed.', occurred_at: '2026-08-23T00:00:02.000Z',
          result: 'completed', run_id: 'run-completed', started_at: '2026-08-23T00:00:01.000Z',
          status: 'completed'
        }]}
        onSync={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Sync Now' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('data-sync-action-mode');
    expect(button).not.toHaveAttribute('data-sync-run-id');
    expect(button).toHaveAttribute('data-sync-terminal-run-id', 'run-completed');
    expect(button).toHaveAttribute('data-sync-terminal-result', 'completed');
    expect(button).toHaveAttribute('data-sync-terminal-started-at', '2026-08-23T00:00:01.000Z');
    expect(button).toHaveAttribute('data-sync-runtime-booted-at', '2026-08-23T00:00:00.000Z');
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
