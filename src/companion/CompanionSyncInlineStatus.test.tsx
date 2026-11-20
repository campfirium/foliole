import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

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
  it('keeps both sync indicators at inline size while preserving the settings touch target', async () => {
    const { CompanionSyncInlineStatus } = await import('./CompanionSyncInlineStatus');
    const onOpenSyncSettings = vi.fn();
    const { rerender } = renderWithLocalization(
      <CompanionSyncInlineStatus onOpenSyncSettings={onOpenSyncSettings}
        workspaceSync={createWorkspaceSync({ status: 'syncing' }) as never} />
    );
    const progress = screen.getByRole('button', { name: 'Sync in progress' });
    expect(progress).toHaveClass('h-10', 'w-10');
    expect(progress.querySelector('[aria-hidden="true"]')).toHaveClass('h-4', 'w-4');
    fireEvent.click(progress);

    rerender(<CompanionSyncInlineStatus onOpenSyncSettings={onOpenSyncSettings}
      workspaceSync={createWorkspaceSync({ error: 'Sync failed.' }) as never} />);
    const attention = screen.getByRole('button', { name: 'Sync needs attention' });
    expect(attention).toHaveClass('h-10', 'w-10');
    expect(attention.querySelector('[aria-hidden="true"]')).toHaveClass('h-4', 'w-4');
    fireEvent.click(attention);
    expect(onOpenSyncSettings).toHaveBeenCalledTimes(1);
  });

  it('shows top bar sync progress as an icon-only entry', async () => {
    const { CompanionSyncInlineStatus } = await import('./CompanionSyncInlineStatus');

    renderWithLocalization(
      <CompanionSyncInlineStatus
        onOpenSyncSettings={vi.fn()}
        workspaceSync={createWorkspaceSync({ status: 'syncing' }) as never}
      />
    );

    expect(screen.getByRole('button', { name: 'Sync in progress' }))
      .toHaveAttribute('data-testid', 'companion-sync-inline-progress');
    expect(screen.queryByText('Syncing topics')).not.toBeInTheDocument();
    expect(screen.queryByText('Bringing the latest desktop content onto this device.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });

  it('keeps sync failures out of the main content flow', async () => {
    const { CompanionSyncInlineStatus } = await import('./CompanionSyncInlineStatus');

    renderWithLocalization(
      <CompanionSyncInlineStatus
        onOpenSyncSettings={vi.fn()}
        workspaceSync={createWorkspaceSync({ error: 'Desktop sync failed.' }) as never}
      />
    );

    expect(screen.getByRole('button', { name: 'Sync needs attention' }))
      .toHaveAttribute('data-testid', 'companion-sync-inline-attention');
    expect(screen.queryByText('Desktop sync failed.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });
});

it('offers one-tap sync while idle once a sync endpoint exists, and nothing without one', async () => {
  const { CompanionSyncInlineStatus } = await import('./CompanionSyncInlineStatus');
  const workspaceSync = createWorkspaceSync();
  const view = renderWithLocalization(
    <CompanionSyncInlineStatus onOpenSyncSettings={vi.fn()} workspaceSync={workspaceSync as never} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  expect(workspaceSync.pullFromDesktop).toHaveBeenCalledExactlyOnceWith('http://10.0.2.2:38641');
  view.unmount();

  renderWithLocalization(<CompanionSyncInlineStatus onOpenSyncSettings={vi.fn()} workspaceSync={createWorkspaceSync({
    state: { endpoint_url: null, last_synced_at: null, remembered_targets: [], sync_events: [] }
  }) as never} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
