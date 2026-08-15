import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncPanel } from './CompanionSyncPanel';

const compatibility = {
  missing_capabilities: [],
  negotiated_version: 1,
  reason: null,
  status: 'compatible' as const
};
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
    onDisconnectPairing: vi.fn(async () => undefined),
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
    expect(screen.getByText('Connect to a Sync Group')).toBeInTheDocument();
    expect(screen.getByText(/open Sync Group on an active device/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('http://10.0.2.2:38641')).not.toBeInTheDocument();
    expect(screen.queryByText('This device')).not.toBeInTheDocument();
    expect(screen.queryByText('Sync now')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause Sync' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connect to Sync Group' }));

    await waitFor(() => {
      expect(props.onCheckDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641');
    });
  });

  it('uses the ordinary connection entry when a group key is unavailable', () => {
    const props = createProps();
    renderWithLocalization(<CompanionSyncPanel {...props} syncGroup={{
      created_at: '2026-08-08T00:00:00.000Z', created_by_device_id: 'Maci', display_name: 'Maci',
      group_id: 'group-1', local_device_id: 'Xiaomi 23049RAD8C', local_member_state: 'active',
      members: [{ approved_by_device_id: 'Maci', authorization_id: 'join-a5',
        device_id: 'Xiaomi 23049RAD8C', device_kind: 'android-capacitor',
        device_name: 'Xiaomi 23049RAD8C', joined_at: '2026-08-08T00:00:00.000Z', state: 'active' }],
      timeline_id: 'timeline-1'
    }} />);

    expect(screen.queryByText('Current Sync Group')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect to Sync Group' })).toBeInTheDocument();
  });

});

describe('CompanionSyncPanel pairing states', () => {

  it('shows searching inside the connection dialog while discovery is running', async () => {
    const props = createProps();

    renderWithLocalization(<CompanionSyncPanel {...props} pairingStatus="checking-desktop" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Looking for a Sync Group' })).toBeInTheDocument();
    expect(screen.getByText(/open Sync Group on an active member/)).toBeInTheDocument();
    expect(screen.getByText('Searching...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect to Sync Group' })).not.toBeInTheDocument();
    expect(screen.queryByText('Connect to a Sync Group')).not.toBeInTheDocument();

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
          compatibility,
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
    expect(screen.getByText('Request to join this Sync Group.')).toBeInTheDocument();
    expect(screen.queryByText('Connect to a Sync Group')).not.toBeInTheDocument();
    expect(screen.queryByText('Set up sync')).not.toBeInTheDocument();
    expect(screen.queryByText('Choose the device to pair and sync with.')).not.toBeInTheDocument();
    expect(screen.getByText('Foliole Desktop on ZEPHU-PC')).toBeInTheDocument();
    expect(screen.getByText('(Windows)')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.8:38641')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pair with this device' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

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
          compatibility,
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

    const button = screen.getByRole('button', { name: 'Joining...' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});

describe('CompanionSyncPanel multiple discovery list', () => {
  it('lists multiple discovered desktops and pairs the selected row', async () => {
    const props = {
      ...createProps(),
      desktopDiscoveries: [
        {
          appVersion: '37.10.3',
          compatibility,
          desktopDeviceName: 'Foliole Desktop on V',
          desktopName: 'Foliole Desktop',
          desktopPlatform: 'Windows',
          endpointUrl: 'http://192.168.1.8:38641',
          peerId: 'desktop-v'
        },
        {
          appVersion: '37.10.3',
          compatibility,
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
    const pairButtons = screen.getAllByRole('button', { name: 'Join' });
    expect(pairButtons[1]).toHaveAttribute('data-sync-endpoint', 'http://192.168.1.12:38641');
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

    expect(screen.getByText(/Asking a Sync Group member to approve this device/i)).toBeInTheDocument();
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
