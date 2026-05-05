import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionSyncPanel } from './CompanionSyncPanel';

function createProps() {
  return {
    bootstrapState: {
      booted_at: '2026-04-22T09:05:00.000Z',
      database_path: 'foliole-companion-preview.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor' as const
    },
    desktopDiscovery: null,
    endpointUrl: 'http://10.0.2.2:38641',
    error: null,
    lastSyncedAt: '2026-04-22T09:00:00.000Z',
    rememberedTargets: ['http://10.0.2.2:38641', 'http://192.168.1.8:38641'],
    onCheckDesktop: vi.fn(async () => undefined),
    onClearError: vi.fn(),
    onCompletePairing: vi.fn(async () => undefined),
    onPull: vi.fn(async () => undefined),
    onRemoveRememberedTarget: vi.fn(async () => undefined),
    onRequestPairing: vi.fn(async () => undefined),
    onSaveEndpoint: vi.fn(async () => undefined),
    pairingRequest: null,
    pairingState: {
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Android companion',
      is_paired: true,
      paired_at: '2026-04-22T09:00:00.000Z'
    },
    pairingStatus: 'idle' as const,
    status: 'idle' as const
  };
}

describe('CompanionSyncPanel', () => {
  it('routes device check and pairing request actions through explicit buttons', async () => {
    const props = createProps();

    render(<CompanionSyncPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Check this address' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask to connect' }));

    await waitFor(() => {
      expect(props.onCheckDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641');
      expect(props.onRequestPairing).toHaveBeenCalledWith('http://10.0.2.2:38641');
    });
  });

  it('submits a manual snapshot pull only when already paired', async () => {
    const props = createProps();

    render(<CompanionSyncPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enter address manually' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => {
      expect(props.onSaveEndpoint).toHaveBeenCalledWith('http://10.0.2.2:38641');
      expect(props.onPull).toHaveBeenCalledWith('http://10.0.2.2:38641');
    });
  });

  it('lets the user pick a remembered device target before checking it', async () => {
    const props = createProps();

    render(<CompanionSyncPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'http://192.168.1.8:38641' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check this address' }));

    await waitFor(() => {
      expect(props.onCheckDesktop).toHaveBeenCalledWith('http://192.168.1.8:38641');
    });
  });

  it('keeps manual endpoint entry collapsed until the user asks for another device', () => {
    const props = createProps();

    render(<CompanionSyncPanel {...props} />);

    expect(screen.queryByPlaceholderText('http://10.0.2.2:38641')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Enter address manually' }));

    expect(screen.getByPlaceholderText('http://10.0.2.2:38641')).toBeInTheDocument();
  });

  it('shows which remembered device is current', () => {
    const props = createProps();

    render(<CompanionSyncPanel {...props} />);

    expect(screen.getByText('This device uses it')).toBeInTheDocument();
  });

  it('removes an old remembered device target', async () => {
    const props = createProps();

    render(<CompanionSyncPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Forget http://192.168.1.8:38641' }));

    await waitFor(() => {
      expect(props.onRemoveRememberedTarget).toHaveBeenCalledWith('http://192.168.1.8:38641');
    });
  });
});
