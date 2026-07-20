import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import type { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';

import { SettingsCompanionSyncSection } from './SettingsCompanionSyncSection';

const companionPairingMock = vi.hoisted(() => ({
  useDesktopCompanionPairingRequests: vi.fn()
}));

vi.mock('../../../../shared/platform/useDesktopCompanionPairingRequests', () => companionPairingMock);

type PairingState = ReturnType<typeof useDesktopCompanionPairingRequests>;

function createState(overrides: Partial<PairingState> = {}): PairingState {
  return {
    approveRequest: vi.fn(),
    clearPairedDevices: vi.fn(),
    disableSync: vi.fn(),
    enableSync: vi.fn(),
    error: null,
    isDesktopRuntime: true,
    isLoading: false,
    overview: {
      paired_devices: [],
      pending_requests: [],
      primary_device_state: {
        can_initiate_takeover: false,
        local_role: 'primary',
        primary_device_id: 'device-desktop',
        source: 'desktop-paired-default',
        takeover_blocked_reasons: []
      },
      server_status: {
        advertised_urls: [],
        last_error: null,
        paired_device_count: 0,
        pending_pair_request_count: 0,
        port: null,
        state: 'stopped'
      },
      sync_enabled: true
    },
    pendingActionId: null,
    refresh: vi.fn(),
    rejectRequest: vi.fn(),
    removePairedDevice: vi.fn(),
    setDesktopAsPrimaryDevice: vi.fn(),
    ...overrides
  };
}

beforeEach(() => {
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState());
});

it('shows the current primary device role in sync settings', () => {
  renderWithLocalization(<SettingsCompanionSyncSection />);

  expect(screen.getByText('Device role')).toBeInTheDocument();
  expect(screen.getByText('Primary device')).toBeInTheDocument();
  expect(screen.getByText('Current primary')).toBeInTheDocument();
  expect(screen.getByText('This desktop runs sync and external document mirrors for paired devices.')).toBeInTheDocument();
});

it('lets a secondary desktop become the primary device from sync settings', async () => {
  const setDesktopAsPrimaryDevice = vi.fn();
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    overview: {
      ...createState().overview,
      primary_device_state: {
        can_initiate_takeover: false,
        local_role: 'secondary',
        primary_device_id: 'device-android',
        source: 'committed-primary-device',
        takeover_blocked_reasons: ['sync-latest-confirmation-missing']
      }
    },
    setDesktopAsPrimaryDevice
  }));

  renderWithLocalization(<SettingsCompanionSyncSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Set as primary device' }));

  expect(setDesktopAsPrimaryDevice).toHaveBeenCalledTimes(1);
});

it('announces connected devices progress through the settings state surface', () => {
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({ isLoading: true }));

  renderWithLocalization(<SettingsCompanionSyncSection />);

  const status = screen.getByRole('status');
  expect(status).toHaveAttribute('aria-busy', 'true');
  expect(status).toHaveTextContent('');
});

it('shows the product iOS label for a paired iPhone', () => {
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    overview: {
      ...createState().overview,
      paired_devices: [{
        client_address: '192.168.1.3',
        device_id: 'ios-device',
        device_kind: 'ios-capacitor',
        device_name: 'iPhone 13 mini',
        paired_at: '2026-07-21T00:00:00.000Z'
      }]
    }
  }));

  renderWithLocalization(<SettingsCompanionSyncSection />);

  expect(screen.getByRole('listitem')).toHaveTextContent('iPhone 13 mini (iOS)');
  expect(screen.queryByText(/ios-capacitor/)).not.toBeInTheDocument();
});

it('shows sync server errors through the settings state surface', () => {
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    overview: {
      ...createState().overview,
      server_status: {
        ...createState().overview.server_status,
        last_error: 'Port unavailable.'
      }
    }
  }));

  renderWithLocalization(<SettingsCompanionSyncSection />);

  expect(screen.getByRole('alert')).toHaveTextContent('Desktop sync unavailable');
  expect(screen.getByRole('alert')).toHaveTextContent('Could not open sync. Port unavailable.');
});

it('shows pairing state errors through the settings state surface', () => {
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    error: 'Could not refresh paired devices.'
  }));

  renderWithLocalization(<SettingsCompanionSyncSection />);

  expect(screen.getByRole('alert')).toHaveTextContent('Sync devices unavailable');
  expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh paired devices.');
});
