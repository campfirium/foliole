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
});
