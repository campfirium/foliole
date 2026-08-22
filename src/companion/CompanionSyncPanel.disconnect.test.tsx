import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionSyncPanel } from './CompanionSyncPanel';
import { createConnectedProps } from './CompanionSyncPanel.connected.testSupport';

describe('CompanionSyncPanel disconnect', () => {
  it('keeps disconnect off the main device sync page', () => {
    const props = {
      ...createConnectedProps(),
      onDisconnectPairing: vi.fn(async () => undefined)
    };

    render(<CompanionSyncPanel {...props} />);
    expect(screen.queryByRole('button', { name: 'Disconnect device' })).toBeNull();
  });

  it('disconnects the paired desktop from the connection page', async () => {
    const props = {
      ...createConnectedProps(),
      onDisconnectPairing: vi.fn(async () => undefined),
      page: 'syncConnection' as const
    };

    render(<CompanionSyncPanel {...props} />);
    expect(screen.getByTestId('companion-sync-disconnect')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect device' })[0]!);

    await waitFor(() => {
      expect(props.onClearError).toHaveBeenCalledTimes(1);
      expect(props.onDisconnectPairing).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps credential reauthorization reachable while Sync Group membership remains active', () => {
    const props = {
      ...createConnectedProps(),
      syncGroup: {
        created_at: '2026-08-08T00:00:00.000Z',
        created_by_host_name: 'Foliole Desktop on Windows',
        display_name: 'Studio',
        group_id: 'group-1',
        local_host_name: 'Android companion',
        local_member_state: 'active' as const,
        members: [],
        timeline_id: 'timeline-1'
      }
    };

    render(<CompanionSyncPanel {...props} />);
    fireEvent.click(screen.getByTestId('companion-sync-connection'));

    expect(props.onOpenSettingsPage).toHaveBeenCalledWith('syncConnection');
  });
});
