import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionSyncPanel } from './CompanionSyncPanel';
import { createConnectedProps } from './CompanionSyncPanel.connected.testSupport';

describe('CompanionSyncPanel connection state', () => {
  it('opens the paired-device connection page from sync overview', () => {
    const onOpenSettingsPage = vi.fn();
    render(<CompanionSyncPanel {...createConnectedProps()} onOpenSettingsPage={onOpenSettingsPage} />);

    fireEvent.click(screen.getByTestId('companion-sync-connection'));
    expect(onOpenSettingsPage).toHaveBeenCalledWith('syncConnection');
  });

  it('separates local device identity from the paired desktop', () => {
    render(<CompanionSyncPanel {...createConnectedProps()} page="syncConnection" />);

    expect(screen.getByText('Paired device')).toBeInTheDocument();
    expect(screen.getByText('Foliole Desktop on Windows (Windows)')).toBeInTheDocument();
    expect(screen.getByText('This device')).toBeInTheDocument();
    expect(screen.getByText('Android companion')).toBeInTheDocument();
  });
});
