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
    desktopDiscoveries: [],
    desktopDiscovery: null,
    endpointUrl: 'http://10.0.2.2:38641',
    error: null,
    lastSyncedAt: null,
    rememberedTargets: [],
    onCancelPairing: vi.fn(),
    onCheckDesktop: vi.fn(async () => undefined),
    onClearError: vi.fn(),
    onCompletePairing: vi.fn(async () => undefined),
    onPull: vi.fn(async () => undefined),
    onRemoveRememberedTarget: vi.fn(async () => undefined),
    onRequestPairing: vi.fn(async () => undefined),
    onSaveEndpoint: vi.fn(async () => undefined),
    pairingRequest: null,
    pairingState: {
      device_id: null,
      device_kind: null,
      device_name: null,
      is_paired: false,
      paired_at: null
    },
    pairingStatus: 'idle' as const,
    status: 'idle' as const
  };
}

describe('CompanionSyncPanel', () => {
  it('shows only troubleshooting and retry before a device is found', async () => {
    const props = createProps();

    render(<CompanionSyncPanel {...props} />);

    expect(screen.queryByText('Set up sync')).not.toBeInTheDocument();
    expect(screen.getByText('No device found')).toBeInTheDocument();
    expect(screen.getByText(/Turn on Sync on desktop/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('http://10.0.2.2:38641')).not.toBeInTheDocument();
    expect(screen.queryByText('This device')).not.toBeInTheDocument();
    expect(screen.queryByText('Sync now')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(props.onCheckDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641');
    });
  });
});

describe('CompanionSyncPanel pairing states', () => {

  it('shows a searching state while automatic discovery is running', () => {
    render(<CompanionSyncPanel {...createProps()} pairingStatus="checking-desktop" />);

    expect(screen.getByText('Looking for desktop')).toBeInTheDocument();
    expect(screen.getByText(/desktop with Sync turned on/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows a compact found device row and routes pair action', async () => {
    const props = {
      ...createProps(),
      desktopDiscoveries: [
        {
          appVersion: '37.10.3',
          desktopDeviceName: 'Foliole Desktop on ZEPHU-PC',
          desktopName: 'Foliole Desktop',
          desktopPlatform: 'Windows',
          endpointUrl: 'http://192.168.1.8:38641',
          hostName: 'ZEPHU-PC',
          peerId: 'desktop-local'
        }
      ]
    };

    render(<CompanionSyncPanel {...props} />);

    expect(screen.getByText('Found 1 device')).toBeInTheDocument();
    expect(screen.queryByText('Set up sync')).not.toBeInTheDocument();
    expect(screen.queryByText('Choose the device to pair and sync with.')).not.toBeInTheDocument();
    expect(screen.getByText('ZEPHU-PC')).toBeInTheDocument();
    expect(screen.getByText('(Windows)')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.8:38641')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pair with this device' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pair' }));

    await waitFor(() => {
      expect(props.onRequestPairing).toHaveBeenCalledWith('http://192.168.1.8:38641');
    });
  });

  it('lists multiple discovered desktops and pairs the selected row', async () => {
    const props = {
      ...createProps(),
      desktopDiscoveries: [
        {
          appVersion: '37.10.3',
          desktopDeviceName: 'Foliole Desktop on V',
          desktopName: 'Foliole Desktop',
          desktopPlatform: 'Windows',
          endpointUrl: 'http://192.168.1.8:38641',
          hostName: 'V',
          peerId: 'desktop-v'
        },
        {
          appVersion: '37.10.3',
          desktopDeviceName: 'Foliole Desktop on Studio',
          desktopName: 'Foliole Desktop',
          desktopPlatform: 'macOS',
          endpointUrl: 'http://192.168.1.12:38641',
          hostName: 'Studio',
          peerId: 'desktop-studio'
        }
      ]
    };

    render(<CompanionSyncPanel {...props} />);

    expect(screen.getByText('Found 2 devices')).toBeInTheDocument();
    expect(screen.getByText('V')).toBeInTheDocument();
    expect(screen.getByText('Studio')).toBeInTheDocument();
    const pairButtons = screen.getAllByRole('button', { name: 'Pair' });
    fireEvent.click(pairButtons[1]);

    await waitFor(() => {
      expect(props.onRequestPairing).toHaveBeenCalledWith('http://192.168.1.12:38641');
    });
  });


  it('can leave the desktop approval wait state and return to discovered devices', () => {
    const props = {
      ...createProps(),
      desktopDiscoveries: [
        {
          appVersion: '37.10.3',
          desktopDeviceName: 'Foliole Desktop on V',
          desktopName: 'Foliole Desktop',
          desktopPlatform: 'Windows',
          endpointUrl: 'http://192.168.1.8:38641',
          hostName: 'V',
          peerId: 'desktop-v'
        }
      ],
      pairingRequest: {
        endpointUrl: 'http://192.168.1.8:38641',
        expiresAt: '2026-04-24T10:02:00.000Z',
        pairRequestId: 'pair-request-1'
      },
      pairingStatus: 'awaiting-approval' as const
    };

    render(<CompanionSyncPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose another device' }));

    expect(props.onCancelPairing).toHaveBeenCalledTimes(1);
  });

  it('continues after desktop approval and starts pulling data', async () => {
    const props = {
      ...createProps(),
      pairingRequest: {
        endpointUrl: 'http://192.168.1.8:38641',
        expiresAt: '2026-04-24T10:02:00.000Z',
        pairRequestId: 'pair-request-1'
      },
      pairingStatus: 'awaiting-approval' as const
    };

    render(<CompanionSyncPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(props.onCompletePairing).toHaveBeenCalled();
      expect(props.onPull).toHaveBeenCalledWith('http://192.168.1.8:38641');
    });
  });

  it('shows a paired state without setup controls', () => {
    const props = {
      ...createProps(),
      pairingState: {
        device_id: 'android-test-device',
        device_kind: 'android-capacitor',
        device_name: 'Android companion',
        is_paired: true,
        paired_at: '2026-04-22T09:00:00.000Z'
      }
    };

    render(<CompanionSyncPanel {...props} />);

    expect(screen.getByText('Paired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
