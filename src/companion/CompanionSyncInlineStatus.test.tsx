import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncObjectsMock = vi.hoisted(() => ({
  loadCompanionPendingSyncSummary: vi.fn(async () => ({ pendingCount: 0 }))
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);

function createWorkspaceSync(overrides: Record<string, unknown> = {}) {
  return {
    error: null,
    pullFromDesktop: vi.fn(async () => undefined),
    state: {
      endpoint_url: 'http://10.0.2.2:38641',
      last_synced_at: '2026-04-25T09:00:00.000Z',
      sync_events: []
    },
    status: 'idle',
    ...overrides
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  syncObjectsMock.loadCompanionPendingSyncSummary.mockResolvedValue({ pendingCount: 0 });
});

describe('CompanionSyncInlineStatus visibility', () => {
  it('shows pending local changes and lets the user start sync', async () => {
    syncObjectsMock.loadCompanionPendingSyncSummary.mockResolvedValue({ pendingCount: 2 });
    const workspaceSync = createWorkspaceSync();
    const { CompanionSyncInlineStatus } = await import('./CompanionSyncInlineStatus');

    render(<CompanionSyncInlineStatus workspaceSync={workspaceSync as never} />);

    expect(await screen.findByText('Pending sync')).toBeInTheDocument();
    expect(screen.getByText('2 changes waiting to sync.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(workspaceSync.pullFromDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641');
  });

  it('stays hidden when there is no pending work or error', async () => {
    const { CompanionSyncInlineStatus } = await import('./CompanionSyncInlineStatus');

    render(<CompanionSyncInlineStatus workspaceSync={createWorkspaceSync() as never} />);

    await waitFor(() => expect(syncObjectsMock.loadCompanionPendingSyncSummary).toHaveBeenCalled());
    expect(screen.queryByLabelText('Sync status')).not.toBeInTheDocument();
  });

  it('shows sync failures without waiting for pending work', async () => {
    const { CompanionSyncInlineStatus } = await import('./CompanionSyncInlineStatus');

    render(
      <CompanionSyncInlineStatus
        workspaceSync={createWorkspaceSync({ error: 'Desktop sync failed.' }) as never}
      />
    );

    expect(await screen.findByText('Sync needs attention')).toBeInTheDocument();
    expect(screen.getByText('Desktop sync failed.')).toBeInTheDocument();
  });
});

describe('CompanionSyncInlineStatus pending refresh', () => {
  it('refreshes pending status after local workspace state changes', async () => {
    syncObjectsMock.loadCompanionPendingSyncSummary
      .mockResolvedValueOnce({ pendingCount: 0 })
      .mockResolvedValueOnce({ pendingCount: 1 });
    const { CompanionSyncInlineStatus } = await import('./CompanionSyncInlineStatus');
    const initialWorkspaceSync = createWorkspaceSync();
    const { rerender } = render(<CompanionSyncInlineStatus workspaceSync={initialWorkspaceSync as never} />);

    await waitFor(() => expect(syncObjectsMock.loadCompanionPendingSyncSummary).toHaveBeenCalledTimes(1));
    rerender(
      <CompanionSyncInlineStatus
        workspaceSync={{
          ...initialWorkspaceSync,
          state: {
            ...initialWorkspaceSync.state,
            workspace_snapshot: { activeNodeId: 'article-1' }
          }
        } as never}
      />
    );

    expect(await screen.findByText('1 change waiting to sync.')).toBeInTheDocument();
  });

  it('hides pending status after a successful sync clears local streams', async () => {
    syncObjectsMock.loadCompanionPendingSyncSummary
      .mockResolvedValueOnce({ pendingCount: 1 })
      .mockResolvedValueOnce({ pendingCount: 0 });
    const { CompanionSyncInlineStatus } = await import('./CompanionSyncInlineStatus');
    const initialWorkspaceSync = createWorkspaceSync();
    const { rerender } = render(<CompanionSyncInlineStatus workspaceSync={initialWorkspaceSync as never} />);

    expect(await screen.findByText('1 change waiting to sync.')).toBeInTheDocument();
    rerender(
      <CompanionSyncInlineStatus
        workspaceSync={{
          ...initialWorkspaceSync,
          state: {
            ...initialWorkspaceSync.state,
            last_synced_at: '2026-04-25T09:01:00.000Z',
            sync_events: [{ id: 'sync-1', status: 'completed' }]
          }
        } as never}
      />
    );

    await waitFor(() => expect(screen.queryByLabelText('Sync status')).not.toBeInTheDocument());
  });
});
