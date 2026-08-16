import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncPanel } from './CompanionSyncPanel';

const protocol = {
  capabilities: ['lan-sync-v1', 'sync-group-facts-v1', 'workgroup-aead-v1'],
  max_supported_version: 1,
  min_supported_version: 1,
  version: 1
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
    handoffReminderSettings: { fixedTime: null, shortDelay: 'off' as const },
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

describe('CompanionSyncPanel protocol compatibility', () => {
  it('localizes the stable no-desktop discovery error', () => {
    const props = {
      ...createProps(),
      error: 'No desktop sync device found. Make sure desktop Sync is on and both devices are on the same Wi-Fi.'
    };

    renderWithLocalization(<CompanionSyncPanel {...props} />);
    expect(screen.getByText('Could not look for Sync Groups.')).toBeInTheDocument();
    expect(screen.queryByText(/No desktop sync device found/)).not.toBeInTheDocument();
  });

  it('does not expose the completion rate-limit error code', () => {
    const props = { ...createProps(), error: 'Desktop pairing failed with 429: pair_completion_rate_limited.' };

    renderWithLocalization(<CompanionSyncPanel {...props} />);
    expect(screen.getByText('Could not request to join this Sync Group.')).toBeInTheDocument();
    expect(screen.queryByText(/pair_completion_rate_limited/)).not.toBeInTheDocument();
  });

  it('runs manual sync from a paired device sync page', async () => {
    const props = {
      ...createProps(),
      pairingState: {
        ...createProps().pairingState,
        is_paired: true,
        negotiated_protocol_version: 1,
        remote_protocol: protocol,
        sync_usable: true
      }
    };

    renderWithLocalization(<CompanionSyncPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }));
    await waitFor(() => {
      expect(props.onClearError).toHaveBeenCalledTimes(1);
      expect(props.onPull).toHaveBeenCalledWith('http://10.0.2.2:38641');
    });
  });
});

describe('CompanionSyncPanel protocol rejection', () => {
  it('keeps an incompatible desktop visible but disables connection', () => {
    const props = {
      ...createProps(),
      desktopDiscoveries: [{
        appVersion: '38.0.0',
        compatibility: {
          missing_capabilities: [],
          negotiated_version: null,
          reason: 'protocol_version_unsupported' as const,
          status: 'incompatible' as const
        },
        desktopDeviceName: 'Foliole Desktop on Future',
        desktopName: 'Foliole Desktop',
        desktopPlatform: 'Windows',
        endpointUrl: 'http://192.168.1.20:38641',
        peerId: 'desktop-future'
      }]
    };

    renderWithLocalization(<CompanionSyncPanel {...props} />);
    expect(screen.getByText('Update Foliole on both devices to connect.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled();
  });

  it('offers repair without exposing the manual sync action for old pairing records', async () => {
    const props = {
      ...createProps(),
      pairingState: { ...createProps().pairingState, is_paired: true, repair_required: true }
    };

    renderWithLocalization(<CompanionSyncPanel {...props} />);
    expect(screen.getByText('Pairing needs to be renewed')).toBeInTheDocument();
    expect(screen.getByTestId('companion-sync-repair')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sync' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pair again' }));
    await waitFor(() => expect(props.onDisconnectPairing).toHaveBeenCalledTimes(1));
  });
});
