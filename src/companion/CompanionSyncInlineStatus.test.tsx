import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createWorkspaceSync(overrides: Record<string, unknown> = {}) {
  return {
    error: null,
    pullFromDesktop: vi.fn(async () => undefined),
    state: {
      endpoint_url: 'http://10.0.2.2:38641',
      last_synced_at: '2026-04-25T09:00:00.000Z',
      remembered_targets: ['http://10.0.2.2:38641'],
      sync_events: []
    },
    status: 'idle',
    ...overrides
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('CompanionSyncInlineStatus visibility', () => {
  it('stays hidden while idle even when a sync endpoint is remembered', async () => {
    const { CompanionSyncInlineStatus } = await import('./CompanionSyncInlineStatus');

    render(<CompanionSyncInlineStatus workspaceSync={createWorkspaceSync() as never} />);

    expect(screen.queryByLabelText('Sync status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });

  it('shows foreground sync progress without offering a manual sync action', async () => {
    const { CompanionSyncInlineStatus } = await import('./CompanionSyncInlineStatus');

    render(
      <CompanionSyncInlineStatus
        workspaceSync={createWorkspaceSync({ status: 'syncing' }) as never}
      />
    );

    expect(screen.getByLabelText('Sync status')).toBeInTheDocument();
    expect(screen.getByText('Syncing topics')).toBeInTheDocument();
    expect(screen.queryByText('Bringing the latest desktop content onto this device.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });

  it('keeps sync failures out of the main content flow', async () => {
    const { CompanionSyncInlineStatus } = await import('./CompanionSyncInlineStatus');

    render(
      <CompanionSyncInlineStatus
        workspaceSync={createWorkspaceSync({ error: 'Desktop sync failed.' }) as never}
      />
    );

    expect(screen.queryByText('Sync needs attention')).not.toBeInTheDocument();
    expect(screen.queryByText('Desktop sync failed.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sync status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });
});
