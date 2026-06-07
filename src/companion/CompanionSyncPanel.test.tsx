import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

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
    handoffReminderSettings: {
      fixedTime: null,
      shortDelay: 'off' as const
    },
    lastSyncedAt: null,
    rememberedTargets: [],
    syncConflictCount: 0,
    syncEvents: [],
    syncProgress: null,
    onCancelPairing: vi.fn(),
    onCheckDesktop: vi.fn(async () => undefined),
    onChangeHandoffReminderSettings: vi.fn(),
    onClearError: vi.fn(),
    onCompletePairing: vi.fn(async () => undefined),
    onPull: vi.fn(async () => undefined),
    onRemoveRememberedTarget: vi.fn(async () => undefined),
    onRequestPrimaryDeviceTakeover: vi.fn(async () => undefined),
    onRequestPairing: vi.fn(async () => undefined),
    onSaveEndpoint: vi.fn(async () => undefined),
    onOpenSettingsPage: vi.fn(),
    page: 'sync' as const,
    pairingRequest: null,
    pairingState: {
      device_id: null,
      device_kind: null,
      device_name: null,
      is_paired: false,
      paired_at: null,
      primary_device_id: null
    },
    pairingStatus: 'idle' as const,
    status: 'idle' as const
  };
}

describe('CompanionSyncPanel', () => {
  it('shows only troubleshooting and retry before a device is found', async () => {
    const props = createProps();

    renderWithLocalization(<CompanionSyncPanel {...props} />);

    expect(screen.queryByText('Handoff reminders')).not.toBeInTheDocument();
    expect(screen.queryByText('Set up sync')).not.toBeInTheDocument();
    expect(screen.getByText('Bring content from another device')).toBeInTheDocument();
    expect(screen.getByText(/device that already has your content/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('http://10.0.2.2:38641')).not.toBeInTheDocument();
    expect(screen.queryByText('This device')).not.toBeInTheDocument();
    expect(screen.queryByText('Sync now')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connect another device' }));

    await waitFor(() => {
      expect(props.onCheckDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641');
    });
  });

  it('runs manual sync from a paired device sync page', async () => {
    const props = {
      ...createProps(),
      pairingState: { ...createProps().pairingState, is_paired: true }
    };

    renderWithLocalization(<CompanionSyncPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }));

    await waitFor(() => {
      expect(props.onClearError).toHaveBeenCalledTimes(1);
      expect(props.onPull).toHaveBeenCalledWith('http://10.0.2.2:38641');
    });
  });
});

describe('CompanionSyncPanel pairing states', () => {

  it('shows searching inside the connection dialog while discovery is running', async () => {
    const props = createProps();

    renderWithLocalization(<CompanionSyncPanel {...props} pairingStatus="checking-desktop" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Looking for another device' })).toBeInTheDocument();
    expect(screen.getByText(/open Device sync on the desktop/)).toBeInTheDocument();
    expect(screen.getByText('Searching...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect another device' })).not.toBeInTheDocument();
    expect(screen.queryByText('Bring content from another device')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(props.onCheckDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641');
    });
  });
});

describe('CompanionSyncPanel discovery list', () => {
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
          peerId: 'desktop-local'
        }
      ]
    };

    renderWithLocalization(<CompanionSyncPanel {...props} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Found 1 device' })).toBeInTheDocument();
    expect(screen.getByText('Connect to this desktop to bring your topics onto this device.')).toBeInTheDocument();
    expect(screen.queryByText('Bring content from another device')).not.toBeInTheDocument();
    expect(screen.queryByText('Set up sync')).not.toBeInTheDocument();
    expect(screen.queryByText('Choose the device to pair and sync with.')).not.toBeInTheDocument();
    expect(screen.getByText('Foliole Desktop on ZEPHU-PC')).toBeInTheDocument();
    expect(screen.getByText('(Windows)')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.8:38641')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pair with this device' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(props.onRequestPairing).toHaveBeenCalledWith('http://192.168.1.8:38641');
    });
  });

  it('shows connecting feedback after the user starts pairing', () => {
    const props = {
      ...createProps(),
      desktopDiscoveries: [
        {
          appVersion: '37.10.3',
          desktopDeviceName: 'Foliole Desktop on V',
          desktopName: 'Foliole Desktop',
          desktopPlatform: 'Windows',
          endpointUrl: 'http://192.168.1.8:38641',
          peerId: 'desktop-v'
        }
      ],
      pairingStatus: 'requesting-pair' as const
    };

    renderWithLocalization(<CompanionSyncPanel {...props} />);

    expect(screen.getByRole('button', { name: 'Connecting...' })).toBeDisabled();
  });
});

describe('CompanionSyncPanel multiple discovery list', () => {
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
          peerId: 'desktop-v'
        },
        {
          appVersion: '37.10.3',
          desktopDeviceName: 'Foliole Desktop on Studio',
          desktopName: 'Foliole Desktop',
          desktopPlatform: 'macOS',
          endpointUrl: 'http://192.168.1.12:38641',
          peerId: 'desktop-studio'
        }
      ]
    };

    renderWithLocalization(<CompanionSyncPanel {...props} />);

    expect(screen.getByRole('heading', { name: 'Found 2 devices' })).toBeInTheDocument();
    expect(screen.queryByText('Bring content from another device')).not.toBeInTheDocument();
    expect(screen.getByText('Foliole Desktop on V')).toBeInTheDocument();
    expect(screen.getByText('Foliole Desktop on Studio')).toBeInTheDocument();
    const pairButtons = screen.getAllByRole('button', { name: 'Connect' });
    fireEvent.click(pairButtons[1]!);

    await waitFor(() => {
      expect(props.onRequestPairing).toHaveBeenCalledWith('http://192.168.1.12:38641');
    });
  });
});

describe('CompanionSyncPanel approval states', () => {
  it('shows live waiting feedback with countdown and a cancel control', () => {
    const props = {
      ...createProps(),
      pairingRequest: {
        endpointUrl: 'http://192.168.1.8:38641',
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        pairRequestId: 'pair-request-1'
      },
      pairingStatus: 'awaiting-approval' as const
    };

    renderWithLocalization(<CompanionSyncPanel {...props} />);

    expect(screen.getByText(/Asking the desktop to allow this device/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for approval\.\.\./i)).toBeInTheDocument();
    expect(screen.getByText(/s left/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onCancelPairing).toHaveBeenCalledTimes(1);
  });

  it('shows an expired message when the pairing window elapses', () => {
    const props = {
      ...createProps(),
      pairingRequest: {
        endpointUrl: 'http://192.168.1.8:38641',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
        pairRequestId: 'pair-request-1'
      },
      pairingStatus: 'awaiting-approval' as const
    };

    renderWithLocalization(<CompanionSyncPanel {...props} />);

    expect(screen.getByText(/Request expired/i)).toBeInTheDocument();
  });
});
